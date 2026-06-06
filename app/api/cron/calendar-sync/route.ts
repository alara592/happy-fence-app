import { NextRequest, NextResponse } from "next/server";
import { syncAppointments } from "@/lib/server/calendar-sync";

// Always run fresh; allow a slow Calendar round-trip.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Calendar sync endpoint. Vercel Cron invokes this on a schedule and (when
 * CRON_SECRET is set) sends `Authorization: Bearer <CRON_SECRET>`. We require
 * that header so the route can't be triggered by the public.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await syncAppointments();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
