import { db } from "./db";
import type { FencePriceRow, GatePriceRow, GlobalSettings } from "@/lib/pricing";
import { snapshotFromReference, type PriceSnapshot } from "@/lib/snapshot";

export interface ExtraCatalogRow {
  id: string;
  name: string;
  price: number;
}

export interface ReferenceData {
  fencePrices: FencePriceRow[];
  gatePrices: GatePriceRow[];
  extras: ExtraCatalogRow[];
  settings: GlobalSettings;
  /** Project-creation defaults (NOT engine inputs) — labor $/ft + margin for new quotes + Quick Quote. */
  defaults: { laborCostFt: number; profitMargin: number };
}

/**
 * Price tables change rarely and never in the field (Anthony, 2026-06-06), so cache
 * them in-process for a short window. Collapses the repeated loads per page (project
 * bundle + /api/reference + the section form all call this) into one DB hit. TTL is
 * short so a deliberate price edit still propagates within a minute.
 */
let cache: { data: ReferenceData; at: number } | null = null;
const TTL_MS = 60_000;

/** Drop the cache (e.g. right after a price-table edit). */
export function clearReferenceCache(): void {
  cache = null;
}

/** Load all price/reference tables, mapped from snake_case rows to engine types. */
export async function loadReference(): Promise<ReferenceData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const client = db();
  const [fences, gates, extras, settings] = await Promise.all([
    client.from("fence_prices").select("*").order("sort_order"),
    client.from("gate_prices").select("*").order("type"),
    client.from("extras").select("*").order("name"),
    client.from("settings").select("*").eq("id", "GLOBAL").single(),
  ]);
  const err = fences.error ?? gates.error ?? extras.error ?? settings.error;
  if (err) throw new Error(`Reference load failed: ${err.message}`);

  const data: ReferenceData = {
    fencePrices: (fences.data ?? []).map((r) => ({
      type: r.type as string,
      perSection: Number(r.per_section),
      ftPerSection: Number(r.ft_per_section),
    })),
    gatePrices: (gates.data ?? []).map((r) => ({
      type: r.type as string,
      style: r.style as "Single" | "Double",
      price: Number(r.price),
    })),
    extras: (extras.data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      price: Number(r.price),
    })),
    settings: {
      defaultTearDownRate: Number(settings.data.default_tear_down_rate),
      defaultDumpRate: Number(settings.data.default_dump_rate),
      permitFee: Number(settings.data.permit_fee),
    },
    defaults: {
      laborCostFt: Number(settings.data.default_labor_cost_ft),
      profitMargin: Number(settings.data.default_margin),
    },
  };

  cache = { data, at: Date.now() };
  return data;
}

/** Snapshot the CURRENT reference tables for freezing onto a new (or repriced) project —
 *  effective-date pricing. See lib/snapshot.ts. */
export async function currentPriceSnapshot(): Promise<PriceSnapshot> {
  return snapshotFromReference(await loadReference());
}
