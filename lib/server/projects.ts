import { db } from "./db";
import { loadReference, ReferenceData } from "./reference";
import {
  projectTotal,
  sectionPrice,
  type ProjectPricingInput,
  type SectionInput,
  type ProjectTotalBreakdown,
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
  type: string;
  linear_ft: number;
  tear_down: boolean;
  dump: boolean;
  take_down_ft: number;
  tear_down_rate: number | null;
  dump_rate: number | null;
  actual_price: number;
}

export interface GateRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  type: string;
  style: "Single" | "Double";
  actual_price: number;
}

export interface ExtraRow {
  id: string;
  project_id: string;
  extra_id: string;
  name: string;
  price: number;
}

const num = (v: unknown) => Number(v);

function normalizeSection(r: Record<string, unknown>): SectionRow {
  return {
    ...(r as unknown as SectionRow),
    linear_ft: num(r.linear_ft),
    take_down_ft: num(r.take_down_ft),
    tear_down_rate: r.tear_down_rate === null ? null : num(r.tear_down_rate),
    dump_rate: r.dump_rate === null ? null : num(r.dump_rate),
    actual_price: num(r.actual_price),
  };
}

function normalizeProject(r: Record<string, unknown>): ProjectRow {
  return {
    ...(r as unknown as ProjectRow),
    labor_cost_ft: num(r.labor_cost_ft),
    profit_margin: num(r.profit_margin),
    discount: num(r.discount),
  };
}

/* ── Pricing glue: DB rows → engine input. NEVER re-implement math here. ── */

export function sectionRowToInput(s: SectionRow): SectionInput {
  return {
    linearFt: s.linear_ft,
    type: s.type,
    tearDown: s.tear_down,
    dump: s.dump,
    takeDownFt: s.take_down_ft,
    tearDownRate: s.tear_down_rate,
    dumpRate: s.dump_rate,
  };
}

export function computeProjectTotal(
  project: ProjectRow,
  sections: SectionRow[],
  gates: GateRow[],
  extras: ExtraRow[],
  ref: ReferenceData,
): ProjectTotalBreakdown {
  const input: ProjectPricingInput = {
    laborCostFt: project.labor_cost_ft,
    profitMargin: project.profit_margin,
    permit: project.permit,
    discount: project.discount,
    sections: sections.map(sectionRowToInput),
    gates: gates.map((g) => ({ type: g.type, style: g.style })),
    extras: extras.map((e) => ({ price: num(e.price) })),
  };
  return projectTotal(input, ref.fencePrices, ref.gatePrices, ref.settings);
}

/** Compute a single section's price for storage in actual_price. */
export function priceSection(
  section: SectionInput,
  project: Pick<ProjectRow, "labor_cost_ft" | "profit_margin">,
  ref: ReferenceData,
): number {
  const fp = ref.fencePrices.find((f) => f.type === section.type);
  if (!fp) throw new Error(`Unknown fence type: ${section.type}`);
  return sectionPrice(
    section,
    fp,
    { laborCostFt: project.labor_cost_ft, profitMargin: project.profit_margin },
    ref.settings,
  ).price;
}

/* ── Fetch helpers ───────────────────────────────────────────────────────── */

export async function getProjectBundle(id: string) {
  const client = db();
  const [proj, sections, gates, extras, ref] = await Promise.all([
    client.from("projects").select("*").eq("id", id).maybeSingle(),
    client.from("project_sections").select("*").eq("project_id", id).order("created_at"),
    client.from("project_gates").select("*").eq("project_id", id).order("created_at"),
    client.from("project_extras").select("*").eq("project_id", id),
    loadReference(),
  ]);
  const err = proj.error ?? sections.error ?? gates.error ?? extras.error;
  if (err) throw new Error(err.message);
  if (!proj.data) return null;

  const project = normalizeProject(proj.data);
  const sectionRows = (sections.data ?? []).map(normalizeSection);
  const gateRows = (gates.data ?? []).map((g) => ({ ...g, actual_price: num(g.actual_price) })) as GateRow[];
  const extraRows = (extras.data ?? []).map((e) => ({ ...e, price: num(e.price) })) as ExtraRow[];

  return {
    project,
    sections: sectionRows,
    gates: gateRows,
    extras: extraRows,
    breakdown: computeProjectTotal(project, sectionRows, gateRows, extraRows, ref),
    ref,
  };
}

/** Recompute + persist every section price for a project (labor/margin changed). */
export async function recomputeProjectSections(projectId: string): Promise<void> {
  const bundle = await getProjectBundle(projectId);
  if (!bundle) return;
  const client = db();
  for (const s of bundle.sections) {
    const price = priceSection(sectionRowToInput(s), bundle.project, bundle.ref);
    if (price !== s.actual_price) {
      const { error } = await client
        .from("project_sections")
        .update({ actual_price: price })
        .eq("id", s.id);
      if (error) throw new Error(error.message);
    }
  }
}

export { normalizeProject, normalizeSection };
