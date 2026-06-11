import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";

/** Price tables + settings for dropdowns and price previews, plus usage counts
 *  (how often each fence type / gate combo appears across projects) that power
 *  the one-tap quick-pick chips. */
export async function GET() {
  try {
    const ref = await loadReference();
    const usage = {
      materials: {} as Record<string, number>, // fence type → count
      gates: {} as Record<string, number>, // "type|style" → count
    };
    const client = db();
    const [mats, gates] = await Promise.all([
      client.from("project_materials").select("type"),
      client.from("project_gates").select("type, style"),
    ]);
    for (const r of mats.data ?? []) {
      usage.materials[r.type] = (usage.materials[r.type] ?? 0) + 1;
    }
    for (const r of gates.data ?? []) {
      const k = `${r.type}|${r.style}`;
      usage.gates[k] = (usage.gates[k] ?? 0) + 1;
    }
    return NextResponse.json({ ...ref, usage });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
