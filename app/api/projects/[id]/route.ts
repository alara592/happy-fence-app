import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { getProjectBundle } from "@/lib/server/projects";

type Params = { params: Promise<{ id: string }> };

/** GET — project + children + rendered price board. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const bundle = await getProjectBundle(id);
    if (!bundle) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { ref, ...rest } = bundle;
    return NextResponse.json(rest);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** PATCH — update project. Board is computed on read, so no recompute step. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.client !== undefined) update.client = String(b.client).trim();
    if (b.address !== undefined) update.address = b.address || null;
    if (b.date !== undefined) update.date = b.date;
    if (b.permit !== undefined) update.permit = !!b.permit;
    if (b.labor_cost_ft !== undefined) update.labor_cost_ft = Number(b.labor_cost_ft);
    if (b.profit_margin !== undefined) update.profit_margin = Number(b.profit_margin);
    if (b.discount !== undefined) update.discount = Number(b.discount);
    if (b.notes !== undefined) update.notes = b.notes || null;
    if (b.price_mod_notes !== undefined) update.price_mod_notes = b.price_mod_notes || null;

    const { data, error } = await db()
      .from("projects")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE — cascades to sections/gates/extras/materials via FK. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { error } = await db().from("projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
