import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { etDate } from "@/lib/format";
import { loadReference } from "@/lib/server/reference";
import { snapshotFromReference } from "@/lib/snapshot";

/**
 * POST — create a Project from an appointment, then link them.
 * No-duplicate guard: if the appointment already has project_id, return that
 * project instead of making a second one (mirrors the AppSheet Create Project
 * action's guard). The link is set here, at creation — no pre-generated IDs.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const { data: appt, error: aErr } = await db()
      .from("appointments")
      .select("id, client, address, start_at, project_id")
      .eq("id", id)
      .single();
    if (aErr) throw new Error(aErr.message);
    if (!appt) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

    // Already linked → hand back the existing project (idempotent, no duplicate).
    if (appt.project_id) {
      return NextResponse.json({ project_id: appt.project_id, created: false });
    }

    const ref = await loadReference();
    const price_snapshot = snapshotFromReference(ref);
    const { data: project, error: pErr } = await db()
      .from("projects")
      .insert({
        client: appt.client?.trim() || "New client",
        address: appt.address || null,
        date: appt.start_at ? etDate(appt.start_at) : undefined,
        permit: false,
        labor_cost_ft: ref.defaults.laborCostFt,
        profit_margin: ref.defaults.profitMargin,
        price_snapshot,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: lErr } = await db()
      .from("appointments")
      .update({ project_id: project.id })
      .eq("id", id);
    if (lErr) throw new Error(lErr.message);

    return NextResponse.json({ project_id: project.id, created: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
