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
  subtotalCost: number; // pre-markup COGS
  price: number; // marked up, CEIL'd to $100 — what the customer sees
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

  const subtotalCost = material + hardware + labor + tearDownCost + dumpCost;
  const price = ceil100(subtotalCost / (1 - project.profitMargin));

  return { sections, material, hardware, labor, tearDownCost, dumpCost, subtotalCost, price };
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
  /** Estimated job cost (COGS): sections + permit + extras. Gates are excluded — their
   *  price is a flat lookup with margin already baked in, so cost isn't derivable (How-It-Works
   *  §8). Discount excluded — it's a price adjustment, not a cost. Internal-only figure. */
  estCost: number;
  /** Types that failed lookup — UI must surface these, never silently price at $0. */
  unmatchedGateTypes: string[];
}

export function projectTotal(
  input: ProjectPricingInput,
  fencePrices: FencePriceRow[],
  gatePrices: GatePriceRow[],
  settings: GlobalSettings,
): ProjectTotalBreakdown {
  let sectionsCost = 0;
  const sectionsTotal = input.sections.reduce((sum, s) => {
    const fp = fencePrices.find((f) => f.type === s.type);
    if (!fp) throw new Error(`Unknown fence type: ${s.type}`); // FK makes this impossible in the DB; belt-and-braces
    const breakdown = sectionPrice(s, fp, input, settings);
    sectionsCost += breakdown.subtotalCost;
    return sum + breakdown.price;
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
  const total = sectionsTotal + permitFee + gatesTotal + input.discount + extrasTotal;
  const estCost = sectionsCost + permitFee + extrasTotal;

  return { sectionsTotal, permitFee, gatesTotal, discount: input.discount, extrasTotal, total, sectionsCost, estCost, unmatchedGateTypes };
}
