import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";
import { gatePrice } from "@/lib/pricing";

type Params = { params: Promise<{ id: string }> };

/** POST — add gate; flat lookup on (type, style), never silently $0. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!b.type || !["Single", "Double"].includes(b.style)) {
      return NextResponse.json({ error: "Type and Single/Double are required" }, { status: 400 });
    }
    const quantity = Math.floor(Number(b.quantity ?? 1));
    if (!(quantity > 0)) {
      return NextResponse.json({ error: "Quantity must be at least 1" }, { status: 400 });
    }
    const ref = await loadReference();
    const price = gatePrice(b.type, b.style, ref.gatePrices);
    if (price === null) {
      return NextResponse.json(
        { error: `No price for ${b.type}/${b.style} — check the gate price table` },
        { status: 400 },
      );
    }
    const { data, error } = await db()
      .from("project_gates")
      .insert({
        project_id: id,
        name: b.name.trim(),
        description: b.description || null,
        type: b.type,
        style: b.style,
        actual_price: price,
        quantity,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
