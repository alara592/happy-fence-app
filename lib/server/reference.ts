import { db } from "./db";
import type { FencePriceRow, GatePriceRow, GlobalSettings } from "@/lib/pricing";

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
}

/** Load all price/reference tables, mapped from snake_case rows to engine types. */
export async function loadReference(): Promise<ReferenceData> {
  const client = db();
  const [fences, gates, extras, settings] = await Promise.all([
    client.from("fence_prices").select("*").order("type"),
    client.from("gate_prices").select("*").order("type"),
    client.from("extras").select("*").order("name"),
    client.from("settings").select("*").eq("id", "GLOBAL").single(),
  ]);
  const err = fences.error ?? gates.error ?? extras.error ?? settings.error;
  if (err) throw new Error(`Reference load failed: ${err.message}`);

  return {
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
  };
}
