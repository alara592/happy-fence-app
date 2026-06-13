import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { clearReferenceCache } from "@/lib/server/reference";

/**
 * Gate catalog CRUD for the Prices tab. Key is (type, style); `price` is the unit price.
 * Gates are flat lookups and are frozen onto projects at add-time, so editing a catalog
 * price never touches an existing quote. Every write busts the 60s reference cache.
 */
const STYLES = ["Single", "Double"];

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const type = String(b.type ?? "").trim();
    const style = String(b.style ?? "");
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    if (!STYLES.includes(style)) return NextResponse.json({ error: "Style must be Single or Double" }, { status: 400 });
    const price = Number(b.price);
    if (!(price >= 0)) return NextResponse.json({ error: "Price can't be negative" }, { status: 400 });
    const { error } = await db().from("gate_prices").insert({ type, style, price });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "That type + style already exists" }, { status: 409 });
      throw new Error(error.message);
    }
    clearReferenceCache();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const type = String(b.type ?? "");
    const style = String(b.style ?? "");
    if (!type || !STYLES.includes(style)) return NextResponse.json({ error: "type + style required" }, { status: 400 });
    const price = Number(b.price);
    if (!(price >= 0)) return NextResponse.json({ error: "Price can't be negative" }, { status: 400 });
    const { error } = await db().from("gate_prices").update({ price }).eq("type", type).eq("style", style);
    if (error) throw new Error(error.message);
    clearReferenceCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type");
    const style = req.nextUrl.searchParams.get("style");
    if (!type || !style) return NextResponse.json({ error: "type + style required" }, { status: 400 });
    const { error } = await db().from("gate_prices").delete().eq("type", type).eq("style", style);
    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "In use by a project — remove that gate first." }, { status: 409 });
      }
      throw new Error(error.message);
    }
    clearReferenceCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
