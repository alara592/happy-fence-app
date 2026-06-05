import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string; materialId: string }> };

/** PATCH — set this material as the project's Active fence (clears any other). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, materialId } = await params;
    const b = await req.json().catch(() => ({}));
    const activate = b.is_active !== false;

    if (activate) {
      const { error: clearErr } = await db()
        .from("project_materials")
        .update({ is_active: false })
        .eq("project_id", id)
        .eq("is_active", true);
      if (clearErr) throw new Error(clearErr.message);
    }
    const { data, error } = await db()
      .from("project_materials")
      .update({ is_active: activate })
      .eq("id", materialId)
      .eq("project_id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE — remove a material from the board. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, materialId } = await params;
    const { error } = await db()
      .from("project_materials")
      .delete()
      .eq("id", materialId)
      .eq("project_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
