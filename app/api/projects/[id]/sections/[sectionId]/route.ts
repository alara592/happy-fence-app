import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string; sectionId: string }> };

/** PATCH — edit section measurement. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, sectionId } = await params;
    const b = await req.json();
    const blank = (v: unknown) => v === null || v === "";

    const update: Record<string, unknown> = {};
    if (b.name !== undefined) update.name = String(b.name).trim();
    if (b.description !== undefined) update.description = b.description || null;
    if (b.linear_ft !== undefined) {
      if (!(Number(b.linear_ft) > 0)) {
        return NextResponse.json({ error: "Linear Ft must be > 0" }, { status: 400 });
      }
      update.linear_ft = Number(b.linear_ft);
    }
    if (b.tear_down !== undefined) update.tear_down = !!b.tear_down;
    if (b.dump !== undefined) update.dump = !!b.dump;
    if (b.take_down_ft !== undefined) update.take_down_ft = Number(b.take_down_ft);
    if (b.tear_down_rate !== undefined) {
      update.tear_down_rate = blank(b.tear_down_rate) ? null : Number(b.tear_down_rate);
    }
    if (b.dump_rate !== undefined) {
      update.dump_rate = blank(b.dump_rate) ? null : Number(b.dump_rate);
    }

    const { data, error } = await db()
      .from("project_sections")
      .update(update)
      .eq("id", sectionId)
      .eq("project_id", id)
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
