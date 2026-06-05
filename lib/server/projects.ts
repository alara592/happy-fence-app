import { db } from "./db";
import { loadReference, ReferenceData } from "./reference";
import {
  projectTotal,
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
  notes: string | null;
  price_mod_notes: string | null;
  created_at: string;
  updated_at: string;
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
    if (!fp || fp.perSection === 0) {
      return { materialId: m.id, type: m.type, total: null, unpriced: true, active: m.is_active };
    }
    const input: ProjectPricingInput = {
      laborCostFt: project.labor_cost_ft,
      profitMargin: project.profit_margin,
      permit: project.permit,
      discount: project.discount,
      sections: sectionInputs(sections, m.type),
      gates: [], // gates excluded from board rows by design
      extras: extras.map((e) => ({ price: num(e.price) })),
    };
    const { total } = projectTotal(input, ref.fencePrices, ref.gatePrices, ref.settings);
    return { materialId: m.id, type: m.type, total, unpriced: false, active: m.is_active };
  });
}

/* ── Fetch helper ────────────────────────────────────────────────────────── */

export async function getProjectBundle(id: string) {
  const client = db();
  const [proj, sections, gates, extras, materials, ref] = await Promise.all([
    client.from("projects").select("*").eq("id", id).maybeSingle(),
    client.from("project_sections").select("*").eq("project_id", id).order("created_at"),
    client.from("project_gates").select("*").eq("project_id", id).order("created_at"),
    client.from("project_extras").select("*").eq("project_id", id),
    client.from("project_materials").select("*").eq("project_id", id),
    loadReference(),
  ]);
  const err = proj.error ?? sections.error ?? gates.error ?? extras.error ?? materials.error;
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

  return {
    project,
    sections: sectionRows,
    gates: gateRows,
    extras: extraRows,
    materials: materialRows,
    board,
    gatesTotal,
    activeType: activeRow?.type ?? null,
    total,
    totalLinearFt: sectionRows.reduce((sum, s) => sum + s.linear_ft, 0),
    ref,
  };
}
