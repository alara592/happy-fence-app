import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { currentPriceSnapshot } from "@/lib/server/reference";

/**
 * POST — re-freeze this project at CURRENT prices ("Update to current" on the
 * prices-changed banner). Overwrites price_snapshot with today's reference tables, so the
 * project then quotes at current prices. The only way a frozen quote ever reprices.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const snapshot = await currentPriceSnapshot();
    const { error } = await db().from("projects").update({ price_snapshot: snapshot }).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
