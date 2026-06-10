/**
 * Happy Fence Company — Pricing Engine
 *
 * THE single source of truth for all quote math. UI and server both import this.
 * Implements the model from CHANGELOG.md Entry #1 (2026-05-26 rebuild, true 30%
 * net margin) + Entry #5 (editable override-or-global tear-down/dump rates).
 *
 * Reference semantics (must match the retired AppSheet app exactly):
 *   sectionPrice = CEIL_100(
 *     ( CEIL(linearFt / ftPerSection) * perSection     // whole sections of material
 *       + (linearFt / 50) * 25                          // hardware ($0.50/ft)
 *       + linearFt * laborCostFt                        // install labor
 *       + (tearDown ? takeDownFt * effTearRate : 0)     // tear-down
 *       + (dump     ? takeDownFt * effDumpRate : 0)     // dump
 *     ) / (1 - profitMargin)                            // everything inside the markup
 *   )
 *   effRate = per-section override if set, else the global default (Settings).
 *
 *   gatePrice    = flat lookup on (type, style)  // current model; margin rebuild is post-migration
 *   projectTotal = Σ sectionPrice + (permit ? permitFee : 0) + Σ gatePrice + discount + Σ extras
 *
 * Ground-truth fixtures (tests/pricing.test.ts):
 *   Frank Theye  $3,600  — RECOVERY-stuck-sync-rows-2026-06-03.md (hand-verified on device)
 *   Pedro Bravo  $3,300  — same doc
 */

export interface FencePriceRow {
  type: string;
  perSection: number; // $ per section of material (0 = unpriced flag, e.g. Vinyl - Walnut)
  ftPerSection: number; // span in ft (4, 6, 10)
}

export interface GatePriceRow {
  type: string;
  style: "Single" | "Double";
  price: number;
}

export interface GlobalSettings {
  defaultTearDownRate: number; // $/ft — live value 3
  defaultDumpRate: number; // $/ft — live value 3
  permitFee: number; // flat — live value 300
}

export interface SectionInput {
  linearFt: number;
  type: string;
  tearDown: boolean;
  dump: boolean;
  takeDownFt: number;
  /** Per-section overrides; null/undefined = use global default (Entry #5 semantics). */
  tearDownRate?: number | null;
  dumpRate?: number | null;
}

export interface ProjectPricingInput {
  laborCostFt: number;
  /** Stored as a decimal, e.g. 0.30 for 30% — same convention as the app/sheets. */
  profitMargin: number;
  permit: boolean;
  /** Signed: negative = discount, positive = surcharge. */
  discount: number;
  /** Whether haul-away/dump is billed on this quote. Default true. When false the dump
   *  line is $0 and its cost drops out of estCost (you don't haul it, you don't charge). */
  dumpIncluded?: boolean;
  sections: SectionInput[];
  gates: { type: string; style: "Single" | "Double" }[];
  extras: { price: number }[];
}

const EPSILON = 1e-9; // guards float artifacts (e.g. 3500.0000000004 must not ceil to 3600)

/** Round UP to the next $100 (AppSheet: CEILING(x/100)*100). Exact multiples stay put. */
export function ceil100(x: number): number {
  return Math.ceil(x / 100 - EPSILON) * 100;
}

/** Whole sections of material: you can't buy 0.75 of a section's pickets (Entry #1). */
export function wholeSections(linearFt: number, ftPerSection: number): number {
  return Math.ceil(linearFt / ftPerSection - EPSILON);
}

export function effectiveRate(override: number | null | undefined, globalDefault: number): number {
  // Entry #5: blank → global default. An explicit 0 is a deliberate "no charge".
  return override === null || override === undefined ? globalDefault : override;
}

export interface SectionPriceBreakdown {
  sections: number;
  material: number;
  hardware: number;
  labor: number;
  tearDownCost: number;
  dumpCost: number;
  costExDump: number; // pre-markup COGS WITHOUT dump (dump is billed as its own line)
  subtotalCost: number; // full pre-markup COGS (= costExDump + dumpCost)
  price: number; // marked up, CEIL'd to $100 — the fence price, EXCLUDING dump
}

export function sectionPrice(
  section: SectionInput,
  fencePrice: FencePriceRow,
  project: Pick<ProjectPricingInput, "laborCostFt" | "profitMargin">,
  settings: GlobalSettings,
): SectionPriceBreakdown {
  if (section.linearFt <= 0) throw new Error("linearFt must be > 0");
  if (project.profitMargin >= 1) throw new Error("profitMargin must be < 1 (decimal, e.g. 0.30)");

  const sections = wholeSections(section.linearFt, fencePrice.ftPerSection);
  const material = sections * fencePrice.perSection;
  const hardware = (section.linearFt / 50) * 25; // $0.50/ft
  const labor = section.linearFt * project.laborCostFt;
  const tearDownCost = section.tearDown
    ? section.takeDownFt * effectiveRate(section.tearDownRate, settings.defaultTearDownRate)
    : 0;
  const dumpCost = section.dump
    ? section.takeDownFt * effectiveRate(section.dumpRate, settings.defaultDumpRate)
    : 0;

  const costExDump = material + hardware + labor + tearDownCost; // dump billed separately
  const subtotalCost = costExDump + dumpCost; // full COGS
  const price = ceil100(costExDump / (1 - project.profitMargin)); // fence price excludes dump

  return { sections, material, hardware, labor, tearDownCost, dumpCost, costExDump, subtotalCost, price };
}

/** Flat lookup — current gate model (How-It-Works §8). Returns null if no match (caller must handle). */
export function gatePrice(
  type: string,
  style: "Single" | "Double",
  gatePrices: GatePriceRow[],
): number | null {
  const row = gatePrices.find((g) => g.type === type && g.style === style);
  return row ? row.price : null;
}

export interface ProjectTotalBreakdown {
  sectionsTotal: number;
  permitFee: number;
  gatesTotal: number;
  discount: number;
  extrasTotal: number;
  total: number;
  /** Σ pre-markup section COGS (material + hardware + labor + tear-down + dump). */
  sectionsCost: number;
  /** Σ pre-markup dump COGS across sections (take-down ft × dump rate). Independent of the
   *  include toggle — the raw cost of hauling, used for the breakdown. */
  dumpCost: number;
  /** Marked-up, $100-rounded dump line amount IF billed (regardless of the toggle) — what the
   *  "Dump old fence" line would read. 0 when no section is flagged for dump. */
  dumpPrice: number;
  /** The dump line actually applied to the total: dumpPrice when included, else 0. */
  dumpTotal: number;
  /** Estimated job cost (COGS): sections (incl. dump only when billed) + permit + extras. Gates
   *  are excluded — flat lookup with margin baked in, cost not derivable (How-It-Works §8).
   *  Discount excluded — a price adjustment, not a cost. Internal-only figure. */
  estCost: number;
  /** Internal cost line items that sum to estCost (for the breakdown modal). */
  costBreakdown: {
    material: number;
    hardware: number;
    labor: number;
    tearDown: number;
    dump: number; // 0 when dumping isn't billed on this quote
    permit: number;
    extras: number;
  };
  /** Types that failed lookup — UI must surface these, never silently price at $0. */
  unmatchedGateTypes: string[];
}

export function projectTotal(
  input: ProjectPricingInput,
  fencePrices: FencePriceRow[],
  gatePrices: GatePriceRow[],
  settings: GlobalSettings,
): ProjectTotalBreakdown {
  const dumpIncluded = input.dumpIncluded ?? true;

  // Accumulate per-section components so we can both price the fence (ex-dump) and bill dump
  // as one separate line, and itemize the cost breakdown.
  let material = 0,
    hardware = 0,
    labor = 0,
    tearDown = 0,
    dumpCost = 0,
    sectionsCostExDump = 0;
  const sectionsTotal = input.sections.reduce((sum, s) => {
    const fp = fencePrices.find((f) => f.type === s.type);
    if (!fp) throw new Error(`Unknown fence type: ${s.type}`); // FK makes this impossible in the DB; belt-and-braces
    const bd = sectionPrice(s, fp, input, settings);
    material += bd.material;
    hardware += bd.hardware;
    labor += bd.labor;
    tearDown += bd.tearDownCost;
    dumpCost += bd.dumpCost;
    sectionsCostExDump += bd.costExDump;
    return sum + bd.price; // section price excludes dump
  }, 0);

  const unmatchedGateTypes: string[] = [];
  const gatesTotal = input.gates.reduce((sum, g) => {
    const p = gatePrice(g.type, g.style, gatePrices);
    if (p === null) {
      unmatchedGateTypes.push(`${g.type}/${g.style}`);
      return sum;
    }
    return sum + p;
  }, 0);

  const permitFee = input.permit ? settings.permitFee : 0;
  const extrasTotal = input.extras.reduce((sum, e) => sum + e.price, 0);

  // Dump billed as its own optional line: marked up + $100-rounded ONCE (not per section).
  const dumpPrice = dumpCost > 0 ? ceil100(dumpCost / (1 - input.profitMargin)) : 0;
  const dumpTotal = dumpIncluded ? dumpPrice : 0;
  const dumpCostBilled = dumpIncluded ? dumpCost : 0;

  const total = sectionsTotal + dumpTotal + permitFee + gatesTotal + input.discount + extrasTotal;
  const sectionsCost = sectionsCostExDump + dumpCost; // full section COGS (unchanged meaning)
  const estCost = sectionsCostExDump + dumpCostBilled + permitFee + extrasTotal;
  const costBreakdown = {
    material,
    hardware,
    labor,
    tearDown,
    dump: dumpCostBilled,
    permit: permitFee,
    extras: extrasTotal,
  };

  return {
    sectionsTotal,
    permitFee,
    gatesTotal,
    discount: input.discount,
    extrasTotal,
    total,
    sectionsCost,
    dumpCost,
    dumpPrice,
    dumpTotal,
    estCost,
    costBreakdown,
    unmatchedGateTypes,
  };
}
