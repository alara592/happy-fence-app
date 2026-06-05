import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";
import {
  computeProjectTotal,
  normalizeProject,
  normalizeSection,
  type GateRow,
  type ExtraRow,
} from "@/lib/server/projects";

/** GET — project list, newest first, each with its computed total. */
export async function GET() {
  try {
    const client = db();
    const [projects, sections, gates, extras, ref] = await Promise.all([
      client.from("projects").select("*").order("created_at", { ascending: false }),
      client.from("project_sections").select("*"),
      client.from("project_gates").select("*"),
      client.from("project_extras").select("*"),
      loadReference(),
    ]);
    const err = projects.error ?? sections.error ?? gates.error ?? extras.error;
    if (err) throw new Error(err.message);

    const list = (projects.data ?? []).map((p) => {
      const project = normalizeProject(p);
      const s = (sections.data ?? []).filter((r) => r.project_id === p.id).map(normalizeSection);
      const g = (gates.data ?? []).filter((r) => r.project_id === p.id) as GateRow[];
      const x = (extras.data ?? []).filter((r) => r.project_id === p.id) as ExtraRow[];
      return { ...project, total: computeProjectTotal(project, s, g, x, ref).total };
    });
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST — create project. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.client?.trim()) {
      return NextResponse.json({ error: "Client is required" }, { status: 400 });
    }
    const { data, error } = await db()
      .from("projects")
      .insert({
        client: b.client.trim(),
        address: b.address || null,
        date: b.date || undefined,
        permit: !!b.permit,
        labor_cost_ft: Number(b.labor_cost_ft ?? 10),
        profit_margin: Number(b.profit_margin ?? 0.3),
        discount: Number(b.discount ?? 0),
        notes: b.notes || null,
        price_mod_notes: b.price_mod_notes || null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
