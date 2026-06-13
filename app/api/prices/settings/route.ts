import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { clearReferenceCache } from "@/lib/server/reference";

/**
 * PATCH — edit the global settings row (the 5 values on the Prices tab): tear-down rate,
 * dump rate, permit fee, and the new default labor $/ft + margin. Only provided keys change.
 * Busts the reference cache so quotes re-price within the request (existing projects are
 * frozen by their snapshot, so they show the "prices changed" banner instead).
 */
const NUMERIC_COLS = [
  "default_tear_down_rate",
  "default_dump_rate",
  "permit_fee",
  "default_labor_cost_ft",
  "default_margin",
] as const;

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const patch: Record<string, number> = {};
    for (const col of NUMERIC_COLS) {
      if (b[col] !== undefined && b[col] !== null && b[col] !== "") patch[col] = Number(b[col]);
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    if (patch.default_margin !== undefined && (patch.default_margin < 0 || patch.default_margin >= 1)) {
      return NextResponse.json({ error: "Margin must be a decimal between 0 and 0.99" }, { status: 400 });
    }
    if (Object.values(patch).some((v) => Number.isNaN(v) || v < 0)) {
      return NextResponse.json({ error: "Values must be non-negative numbers" }, { status: 400 });
    }
    const { error } = await db().from("settings").update(patch).eq("id", "GLOBAL");
    if (error) throw new Error(error.message);
    clearReferenceCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
