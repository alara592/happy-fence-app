import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";
import { gatePrice } from "@/lib/pricing";

type Params = { params: Promise<{ id: string; gateId: string }> };

/** PATCH — edit gate; price re-looked-up if type/style changed. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, gateId } = await params;
    const b = await req.json();

    const { data: existing, error: exErr } = await db()
      .from("project_gates")
      .select("*")
      .eq("id", gateId)
      .eq("project_id", id)
      .single();
    if (exErr || !existing) return NextResponse.json({ error: "Gate not found" }, { status: 404 });

    const type = b.type ?? existing.type;
    const style = b.style ?? existing.style;
    const ref = await loadReference();
    const price = gatePrice(type, style, ref.gatePrices);
    if (price === null) {
      return NextResponse.json(
        { error: `No price for ${type}/${style} — check the gate price table` },
        { status: 400 },
      );
    }
    const { data, error } = await db()
      .from("project_gates")
      .update({
        name: b.name !== undefined ? String(b.name).trim() : existing.name,
        description: b.description !== undefined ? b.description || null : existing.description,
        type,
        style,
        actual_price: price,
      })
      .eq("id", gateId)
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
    const { id, gateId } = await params;
    const { error } = await db()
      .from("project_gates")
      .delete()
      .eq("id", gateId)
      .eq("project_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
