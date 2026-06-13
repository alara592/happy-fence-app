import {
  projectTotal,
  type FencePriceRow,
  type GatePriceRow,
  type GlobalSettings,
  type ProjectPricingInput,
} from "@/lib/pricing";

/**
 * Price snapshot — effective-date pricing / quote freeze (Anthony, 2026-06-13).
 *
 * A project's quoted number depends on the reference tables. Gates and extras are already
 * frozen the moment they're added (their price is copied onto the project row), so the only
 * live inputs that can silently reprice an open quote are the fence prices and the three
 * global rates. We freeze exactly those at quote time and price the project from its own copy.
 *
 * Written two ways that MUST agree on shape: SQL (the backfill in db/migrations.md #9) and JS
 * (`snapshotFromReference` at project create). Same camelCase keys both ways, so
 * `getProjectBundle` reads them uniformly.
 */
export interface PriceSnapshot {
  fencePrices: FencePriceRow[];
  gatePrices: GatePriceRow[];
  settings: GlobalSettings;
}

/** The engine-relevant slice of a reference set. */
type PricingTables = {
  fencePrices: FencePriceRow[];
  gatePrices: GatePriceRow[];
  settings: GlobalSettings;
};

/** Freeze the current reference tables into a snapshot (drops the extras catalog — extras are
 *  copied per-project, never live-priced). */
export function snapshotFromReference(ref: PricingTables): PriceSnapshot {
  return {
    fencePrices: ref.fencePrices.map((f) => ({
      type: f.type,
      perSection: f.perSection,
      ftPerSection: f.ftPerSection,
    })),
    gatePrices: ref.gatePrices.map((g) => ({ type: g.type, style: g.style, price: g.price })),
    settings: {
      defaultTearDownRate: ref.settings.defaultTearDownRate,
      defaultDumpRate: ref.settings.defaultDumpRate,
      permitFee: ref.settings.permitFee,
    },
  };
}

/** Defensively re-type a snapshot read back from jsonb (numbers should survive, but coerce so a
 *  stringified value can never poison the engine). Returns null for an absent/garbage snapshot. */
export function coerceSnapshot(raw: unknown): PriceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fences = Array.isArray(r.fencePrices) ? r.fencePrices : null;
  const gates = Array.isArray(r.gatePrices) ? r.gatePrices : null;
  const s = r.settings as Record<string, unknown> | undefined;
  if (!fences || !gates || !s) return null;
  return {
    fencePrices: fences.map((f) => {
      const o = f as Record<string, unknown>;
      return { type: String(o.type), perSection: Number(o.perSection), ftPerSection: Number(o.ftPerSection) };
    }),
    gatePrices: gates.map((g) => {
      const o = g as Record<string, unknown>;
      return { type: String(o.type), style: o.style as "Single" | "Double", price: Number(o.price) };
    }),
    settings: {
      defaultTearDownRate: Number(s.defaultTearDownRate),
      defaultDumpRate: Number(s.defaultDumpRate),
      permitFee: Number(s.permitFee),
    },
  };
}

/** The active fence's board total (sections + permit + extras + discount + dump, NO gates) under
 *  a given set of tables — null when the active type is unpriced or absent on that side. Mirrors
 *  the board's `rowPricing` so the two can't disagree. */
function activeBoardTotal(
  input: ProjectPricingInput,
  tables: PricingTables,
  activeType: string,
): number | null {
  const fp = tables.fencePrices.find((f) => f.type === activeType);
  if (!fp || fp.perSection === 0) return null;
  return projectTotal(input, tables.fencePrices, tables.gatePrices, tables.settings).total;
}

/**
 * Has the quoted number drifted? Compares the active fence's board total under the snapshot vs
 * live. Gates are excluded here (frozen at add-time), so this is exactly the part of the total
 * that can move. `input` must have its sections typed as `activeType` and `gates: []`.
 */
export function pricesChangedForProject(
  snapshot: PriceSnapshot,
  live: PricingTables,
  input: ProjectPricingInput,
  activeType: string | null,
): boolean {
  if (!activeType) return false; // nothing quoted yet → nothing to drift
  return activeBoardTotal(input, snapshot, activeType) !== activeBoardTotal(input, live, activeType);
}
