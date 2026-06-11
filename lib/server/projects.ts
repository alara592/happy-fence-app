import { db } from "./db";
import { loadReference, ReferenceData } from "./reference";
import {
  projectTotal,
  sectionPrice,
  type FencePriceRow,
  type ProjectPricingInput,
  type SectionInput,
} from "@/lib/pricing";

/* ── Row shapes (DB, snake_case) ─────────────────────────────────────────── */

export interface ProjectRow {
  id: string;
  client: string;
  address: string | null;
  date: string;
  permit: boolean;
  labor_cost_ft: number;
  profit_margin: number;
  discount: number;
  dump_included: boolean;
  notes: string | null;
  price_mod_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Internal cost line items that sum to estCost — fed to the breakdown modal. */
export interface CostBreakdown {
  material: number;
  hardware: number;
  labor: number;
  tearDown: number;
  dump: number;
  permit: number;
  extras: number;
}

export interface SectionRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  linear_ft: number;
  tear_down: boolean;
  dump: boolean;
  take_down_ft: number;
  tear_down_rate: number | null;
  dump_rate: number | null;
}

export interface GateRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  type: string;
  style: "Single" | "Double";
  /** UNIT price — totals multiply by quantity. */
  actual_price: number;
  quantity: number;
}

export interface ExtraRow {
  id: string;
  project_id: string;
  extra_id: string;
  name: string;
  price: number;
}

export interface MaterialRow {
  id: string;
  project_id: string;
  type: string;
  is_active: boolean;
}

/** One rendered row of the price board: sections + permit + extras + discount — NO gates. */
export interface BoardRow {
  materialId: string;
  type: string;
  /** null when the material is unpriced ($0/section) — UI shows a warning, never $0. */
  total: number | null;
  /** Internal estimated job cost (COGS) under this material — null when unpriced. */
  estCost: number | null;
  /** Dump line (marked-up, $100-rounded) that WOULD apply if billed — null when unpriced. */
  dumpPrice: number | null;
  /** Dump line actually in `total`: dumpPrice when included on the quote, else 0. */
  dumpTotal: number | null;
  /** Cost line items summing to estCost — null when unpriced. */
  costBreakdown: CostBreakdown | null;
  unpriced: boolean;
  active: boolean;
}

const num = (v: unknown) => Number(v);

export function normalizeSection(r: Record<string, unknown>): SectionRow {
  return {
    ...(r as unknown as SectionRow),
    linear_ft: num(r.linear_ft),
    take_down_ft: num(r.take_down_ft),
    tear_down_rate: r.tear_down_rate === null ? null : num(r.tear_down_rate),
    dump_rate: r.dump_rate === null ? null : num(r.dump_rate),
  };
}

export function normalizeProject(r: Record<string, unknown>): ProjectRow {
  return {
    ...(r as unknown as ProjectRow),
    labor_cost_ft: num(r.labor_cost_ft),
    profit_margin: num(r.profit_margin),
    discount: num(r.discount),
  };
}

/* ── Price board: the job priced under each selected material.
   Row = sections + permit + extras + discount. Gates are deliberately EXCLUDED —
   they join only in the project total via the active material (Anthony, 2026-06-05).
   All math comes from lib/pricing.ts — this is mapping glue only. */

function sectionInputs(sections: SectionRow[], material: string): SectionInput[] {
  return sections.map((s) => ({
    linearFt: s.linear_ft,
    type: material,
    tearDown: s.tear_down,
    dump: s.dump,
    takeDownFt: s.take_down_ft,
    tearDownRate: s.tear_down_rate,
    dumpRate: s.dump_rate,
  }));
}

/** Board-row pricing for one fence type (sections + permit + extras + discount, NO gates).
    Null when the type is unpriced/unknown. Shared by the board and the catalog picker so
    their totals can never drift. */
function rowPricing(
  project: ProjectRow,
  sections: SectionRow[],
  extras: ExtraRow[],
  fp: FencePriceRow | undefined,
  ref: ReferenceData,
) {
  if (!fp || fp.perSection === 0) return null;
  const input: ProjectPricingInput = {
    laborCostFt: project.labor_cost_ft,
    profitMargin: project.profit_margin,
    permit: project.permit,
    discount: project.discount,
    dumpIncluded: project.dump_included,
    sections: sectionInputs(sections, fp.type),
    gates: [], // gates excluded from board rows by design
    extras: extras.map((e) => ({ price: num(e.price) })),
  };
  return projectTotal(input, ref.fencePrices, ref.gatePrices, ref.settings);
}

export function computeBoard(
  project: ProjectRow,
  sections: SectionRow[],
  gates: GateRow[],
  extras: ExtraRow[],
  materials: MaterialRow[],
  ref: ReferenceData,
): BoardRow[] {
  const catalogOrder = new Map(ref.fencePrices.map((f, i) => [f.type, i]));
  const sorted = [...materials].sort(
    (a, b) => (catalogOrder.get(a.type) ?? 999) - (catalogOrder.get(b.type) ?? 999),
  );

  return sorted.map((m) => {
    const fp = ref.fencePrices.find((f) => f.type === m.type);
    const priced = rowPricing(project, sections, extras, fp, ref);
    if (!priced) {
      return {
        materialId: m.id,
        type: m.type,
        total: null,
        estCost: null,
        dumpPrice: null,
        dumpTotal: null,
        costBreakdown: null,
        unpriced: true,
        active: m.is_active,
      };
    }
    const { total, estCost, dumpPrice, dumpTotal, costBreakdown } = priced;
    return {
      materialId: m.id,
      type: m.type,
      total,
      estCost,
      dumpPrice,
      dumpTotal,
      costBreakdown,
      unpriced: false,
      active: m.is_active,
    };
  });
}

/* ── Fetch helper ────────────────────────────────────────────────────────── */

export async function getProjectBundle(id: string) {
  const client = db();
  const [proj, sections, gates, extras, materials, photos, ref] = await Promise.all([
    client.from("projects").select("*").eq("id", id).maybeSingle(),
    client.from("project_sections").select("*").eq("project_id", id).order("created_at"),
    client.from("project_gates").select("*").eq("project_id", id).order("created_at"),
    client.from("project_extras").select("*").eq("project_id", id),
    client.from("project_materials").select("*").eq("project_id", id),
    client.from("project_photos").select("*").eq("project_id", id).order("sort_order").order("created_at"),
    loadReference(),
  ]);
  const err =
    proj.error ?? sections.error ?? gates.error ?? extras.error ?? materials.error ?? photos.error;
  if (err) throw new Error(err.message);
  if (!proj.data) return null;

  const project = normalizeProject(proj.data);
  const sectionRows = (sections.data ?? []).map(normalizeSection);
  const gateRows = (gates.data ?? []).map((g) => ({
    ...g,
    actual_price: num(g.actual_price),
    quantity: num(g.quantity ?? 1),
  })) as GateRow[];
  const extraRows = (extras.data ?? []).map((e) => ({ ...e, price: num(e.price) })) as ExtraRow[];
  const materialRows = (materials.data ?? []) as MaterialRow[];

  const board = computeBoard(project, sectionRows, gateRows, extraRows, materialRows, ref);
  const gatesTotal = gateRows.reduce((sum, g) => sum + g.actual_price * g.quantity, 0);
  const activeRow = board.find((r) => r.active) ?? null;
  // Project total = active fence row (sections+permit+extras+discount) + gates.
  const total = activeRow && activeRow.total !== null ? activeRow.total + gatesTotal : null;

  // Per-section computed price under the Active fence (null when no/unpriced active fence).
  // Each is the engine's exact, $100-rounded section price — they sum to the fence subtotal.
  const activeFp =
    activeRow && !activeRow.unpriced
      ? ref.fencePrices.find((f) => f.type === activeRow.type) ?? null
      : null;
  const sectionsOut = sectionRows.map((s) => ({
    ...s,
    price:
      activeFp && s.linear_ft > 0
        ? sectionPrice(
            {
              linearFt: s.linear_ft,
              type: activeFp.type,
              tearDown: s.tear_down,
              dump: s.dump,
              takeDownFt: s.take_down_ft,
              tearDownRate: s.tear_down_rate,
              dumpRate: s.dump_rate,
            },
            activeFp,
            { laborCostFt: project.labor_cost_ft, profitMargin: project.profit_margin },
            ref.settings,
          ).price
        : null,
  }));

  // Site photos — the bucket is private, so hand the client short-lived (1h) signed URLs.
  // The client cache revalidates on entry, so a stale/expired URL refreshes on next open.
  const photoRows = (photos.data ?? []) as {
    id: string;
    storage_path: string;
    caption: string | null;
    created_at: string;
  }[];
  let photosOut: { id: string; caption: string | null; url: string | null; created_at: string }[] = [];
  if (photoRows.length) {
    const { data: signed } = await client.storage
      .from("project-photos")
      .createSignedUrls(photoRows.map((p) => p.storage_path), 3600);
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));
    photosOut = photoRows.map((p) => ({
      id: p.id,
      caption: p.caption,
      url: urlByPath.get(p.storage_path) ?? null,
      created_at: p.created_at,
    }));
  }

  return {
    project,
    sections: sectionsOut,
    photos: photosOut,
    gates: gateRows,
    extras: extraRows,
    materials: materialRows,
    board,
    gatesTotal,
    activeType: activeRow?.type ?? null,
    total,
    // Internal-only estimated job cost (COGS) under the active fence — what the job costs
    // Anthony before markup. Gates excluded (cost not derivable). null when no active fence.
    estCost: activeRow?.estCost ?? null,
    // Cost line items (sum to estCost) for the internal breakdown modal.
    costBreakdown: activeRow?.costBreakdown ?? null,
    // Dump / haul-away billed as its own optional line (per the project's dump_included flag).
    // dumpPrice = the line amount that WOULD apply (shown even when off, for the toggle);
    // dumpTotal = the amount actually in `total` (0 when excluded).
    dumpIncluded: project.dump_included,
    dumpPrice: activeRow?.dumpPrice ?? null,
    dumpTotal: activeRow?.dumpTotal ?? null,
    totalLinearFt: sectionRows.reduce((sum, s) => sum + s.linear_ft, 0),
    // Catalog for the board $/section readout — folded in so the detail page needs one
    // request, not a second /api/reference round trip.
    fencePrices: ref.fencePrices,
    // The whole catalog priced for THIS job (same rowPricing path as board rows, so the
    // numbers can never disagree) — feeds the add-material picker: pick from prices, not
    // names. total null = unpriced.
    catalog: ref.fencePrices.map((fp) => ({
      type: fp.type,
      perSection: fp.perSection,
      total: rowPricing(project, sectionRows, extraRows, fp, ref)?.total ?? null,
      unpriced: fp.perSection === 0,
    })),
    // For the customer Present page: the fence-only subtotal (board row = sections + dump +
    // permit + extras + discount, so back those out — dump shows as its own line) and the
    // permit fee line amount.
    fenceSubtotal:
      activeRow && activeRow.total !== null
        ? activeRow.total -
          (activeRow.dumpTotal ?? 0) -
          (project.permit ? ref.settings.permitFee : 0) -
          extraRows.reduce((s, e) => s + e.price, 0) -
          project.discount
        : null,
    permitFee: ref.settings.permitFee,
    ref,
  };
}
