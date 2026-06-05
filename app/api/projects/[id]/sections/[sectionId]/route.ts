import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";
import { normalizeProject, normalizeSection, priceSection, sectionRowToInput } from "@/lib/server/projects";

type Params = { params: Promise<{ id: string; sectionId: string }> };

/** PATCH — edit section; price recomputed from the merged row (spec §4). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, sectionId } = await params;
    const b = await req.json();

    const [{ data: existing, error: exErr }, { data: proj, error: projErr }, ref] =
      await Promise.all([
        db().from("project_sections").select("*").eq("id", sectionId).eq("project_id", id).single(),
        db().from("projects").select("*").eq("id", id).single(),
        loadReference(),
      ]);
    if (exErr || !existing) return NextResponse.json({ error: "Section not found" }, { status: 404 });
    if (projErr || !proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const blank = (v: unknown) => v === null || v === "";
    const merged = normalizeSection({
      ...existing,
      ...(b.name !== undefined && { name: String(b.name).trim() }),
      ...(b.description !== undefined && { description: b.description || null }),
      ...(b.type !== undefined && { type: b.type }),
      ...(b.linear_ft !== undefined && { linear_ft: Number(b.linear_ft) }),
      ...(b.tear_down !== undefined && { tear_down: !!b.tear_down }),
      ...(b.dump !== undefined && { dump: !!b.dump }),
      ...(b.take_down_ft !== undefined && { take_down_ft: Number(b.take_down_ft) }),
      ...(b.tear_down_rate !== undefined && {
        tear_down_rate: blank(b.tear_down_rate) ? null : Number(b.tear_down_rate),
      }),
      ...(b.dump_rate !== undefined && {
        dump_rate: blank(b.dump_rate) ? null : Number(b.dump_rate),
      }),
    });
    if (!(merged.linear_ft > 0)) {
      return NextResponse.json({ error: "Linear Ft must be > 0" }, { status: 400 });
    }

    const actual_price = priceSection(sectionRowToInput(merged), normalizeProject(proj), ref);

    const { data, error } = await db()
      .from("project_sections")
      .update({
        name: merged.name,
        description: merged.description,
        type: merged.type,
        linear_ft: merged.linear_ft,
        tear_down: merged.tear_down,
        dump: merged.dump,
        take_down_ft: merged.take_down_ft,
        tear_down_rate: merged.tear_down_rate,
        dump_rate: merged.dump_rate,
        actual_price,
      })
      .eq("id", sectionId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, sectionId } = await params;
    const { error } = await db()
      .from("project_sections")
      .delete()
      .eq("id", sectionId)
      .eq("project_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
