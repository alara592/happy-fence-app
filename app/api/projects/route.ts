import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

/** GET — project list, last-edited first. No totals (price-board model). */
export async function GET() {
  try {
    const { data, error } = await db()
      .from("projects")
      .select("id, client, address, date, permit, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
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
        labor_cost_ft: Number(b.labor_cost_ft ?? 12),
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
