import {
  projectTotal,
  type FencePriceRow,
  type GatePriceRow,
  type GlobalSettings,
} from "./pricing";

/**
 * Quick Quote (desktop qualification calculator) — pure helpers.
 *
 * Labor/margin defaults MIRROR the server's POST /api/projects fallbacks (12 / 0.30),
 * so a promoted scratch quote prices identically as a real project. When the Prices
 * screen ships these move to editable settings rows; until then they live here.
 */
export const QQ_LABOR_COST_FT = 12;
export const QQ_PROFIT_MARGIN = 0.3;

export interface QuickInputs {
  linearFt: number;
  walkGates: number;
  doubleGates: number;
  /** One toggle = tear down + dump the whole run (take-down mirrors footage). */
  tearDown: boolean;
  permit: boolean;
}

/**
 * Gate type for a fence type — gates auto-match the fence family (Anthony, 2026-06-12).
 * Explicit rules first (most specific wins), then a keyword fallback against the live
 * catalog, then Vinyl. Returns null only if the gate catalog is empty.
 */
const GATE_RULES: [RegExp, string][] = [
  [/aluminum.*6x6/, "Aluminum(6ft)"],
  [/aluminum/, "Aluminum(4ft)"],
  [/durafence/, "Durafence"],
  [/horizontal/, "Horizontal Vinyl - White"],
  [/louvered/, "Louvered Vinyl(White-6ft)"],
  [/picket/, "Picket Vinyl(4ft)"],
  [/privacy 4ft/, "Privacy Vinyl 4ft(White)"],
  [/cypress/, "Privacy Vinyl - Cypress"],
  [/tan/, "Privacy Vinyl - Tan"],
  [/wood/, "Wood"],
  [/wpc|composite/, "WPC - Composite"],
  [/vinyl/, "Vinyl"],
];

export function matchGateType(fenceType: string, gatePrices: GatePriceRow[]): string | null {
  const types = [...new Set(gatePrices.map((g) => g.type))];
  const f = fenceType.toLowerCase();
  for (const [re, gateType] of GATE_RULES) {
    if (re.test(f) && types.includes(gateType)) return gateType;
  }
  const keyword = fenceType.split("-")[0].trim().toLowerCase();
  const byKeyword = types.find((t) => t.toLowerCase().includes(keyword));
  if (byKeyword) return byKeyword;
  return types.find((t) => t === "Vinyl") ?? types[0] ?? null;
}

/**
 * The qualifying range the assistant reads to the caller: −5% / +10% of the real
 * price, rounded OUT to clean $100s (low down, high up).
 */
export function quoteRange(total: number): { lo: number; hi: number } {
  return {
    lo: Math.floor((total * 0.95) / 100) * 100,
    hi: Math.ceil((total * 1.1) / 100) * 100,
  };
}

/**
 * Whole-job total for one fence type under the Quick Quote inputs — the same
 * engine call a real project makes. null = can't quote (unpriced type or no footage);
 * the UI must show a warning, never $0.
 */
export function quickTotal(
  fenceType: string,
  inputs: QuickInputs,
  fencePrices: FencePriceRow[],
  gatePrices: GatePriceRow[],
  settings: GlobalSettings,
  defaults: { laborCostFt: number; profitMargin: number } = { laborCostFt: QQ_LABOR_COST_FT, profitMargin: QQ_PROFIT_MARGIN },
): number | null {
  const fp = fencePrices.find((f) => f.type === fenceType);
  if (!fp || fp.perSection === 0 || inputs.linearFt <= 0) return null;

  const gateType = matchGateType(fenceType, gatePrices);
  const gates: { type: string; style: "Single" | "Double" }[] = [];
  if (gateType) {
    for (let i = 0; i < inputs.walkGates; i++) gates.push({ type: gateType, style: "Single" });
    for (let i = 0; i < inputs.doubleGates; i++) gates.push({ type: gateType, style: "Double" });
  }

  return projectTotal(
    {
      laborCostFt: defaults.laborCostFt,
      profitMargin: defaults.profitMargin,
      permit: inputs.permit,
      discount: 0,
      sections: [
        {
          linearFt: inputs.linearFt,
          type: fenceType,
          tearDown: inputs.tearDown,
          dump: inputs.tearDown,
          takeDownFt: inputs.tearDown ? inputs.linearFt : 0,
        },
      ],
      gates,
      extras: [],
    },
    fencePrices,
    gatePrices,
    settings,
  ).total;
}
