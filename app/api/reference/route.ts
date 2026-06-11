import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";

/** Price tables + settings for dropdowns and price previews, plus gate usage counts
 *  ("type|style" → how often it appears across projects) that order the quick-add
 *  gate chips. */
export async function GET() {
  try {
    const ref = await loadReference();
    const usage = { gates: {} as Record<string, number> };
    const { data: gates } = await db().from("project_gates").select("type, style");
    for (const r of gates ?? []) {
      const k = `${r.type}|${r.style}`;
      usage.gates[k] = (usage.gates[k] ?? 0) + 1;
    }
    return NextResponse.json({ ...ref, usage });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
