import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { clearReferenceCache } from "@/lib/server/reference";

/**
 * Fence catalog CRUD for the Prices tab. `type` is the PK and is NOT editable here — a
 * rename would have to rewrite every project's frozen price snapshot, so it's deferred.
 * Editing a price changes LIVE prices; existing projects stay frozen (snapshot) and show
 * the "prices changed" banner. Every write busts the 60s reference cache.
 */

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const type = String(b.type ?? "").trim();
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    const perSection = Number(b.perSection ?? 0);
    const ftPerSection = Number(b.ftPerSection);
    if (!(ftPerSection > 0)) return NextResponse.json({ error: "Ft per section must be greater than 0" }, { status: 400 });
    if (!(perSection >= 0)) return NextResponse.json({ error: "Price can't be negative" }, { status: 400 });
    const { error } = await db().from("fence_prices").insert({
      type,
      per_section: perSection,
      ft_per_section: ftPerSection,
      sort_order: b.sortOrder != null ? Number(b.sortOrder) : 999,
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "That fence type already exists" }, { status: 409 });
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
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    const patch: Record<string, number> = {};
    if (b.perSection !== undefined) patch.per_section = Number(b.perSection);
    if (b.ftPerSection !== undefined) patch.ft_per_section = Number(b.ftPerSection);
    if (b.sortOrder !== undefined) patch.sort_order = Number(b.sortOrder);
    if (patch.ft_per_section !== undefined && !(patch.ft_per_section > 0)) {
      return NextResponse.json({ error: "Ft per section must be greater than 0" }, { status: 400 });
    }
    if (Object.values(patch).some((v) => Number.isNaN(v) || v < 0)) {
      return NextResponse.json({ error: "Values must be non-negative numbers" }, { status: 400 });
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    const { error } = await db().from("fence_prices").update(patch).eq("type", type);
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
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    const { error } = await db().from("fence_prices").delete().eq("type", type);
    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "In use by a project — remove it from those boards first." }, { status: 409 });
      }
      throw new Error(error.message);
    }
    clearReferenceCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
