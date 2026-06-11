import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { etDate } from "@/lib/format";

const DAY = 86400000;

/**
 * GET — appointment list, most recent visit first.
 * Default view is windowed to [today−3 … tomorrow] in Miami time, so estimates
 * scheduled far out don't clog the screen. `?all=1` returns everything.
 * (All appointments stay synced regardless — this only narrows what's shown.)
 */
export async function GET(req: NextRequest) {
  try {
    const all = req.nextUrl.searchParams.get("all") === "1";
    let q = db()
      .from("appointments")
      .select("id, client, address, start_at, end_at, status, notes, project_id, meeting_title")
      .neq("status", "Cancelled") // deleted-in-calendar appointments are kept but hidden
      .order("start_at", { ascending: false });

    if (!all) {
      const now = Date.now();
      // Generous UTC pre-filter keeps the query bounded/indexed; exact ET-date
      // filtering happens below so window edges are correct across the offset.
      q = q
        .gte("start_at", new Date(now - 5 * DAY).toISOString())
        .lte("start_at", new Date(now + 3 * DAY).toISOString());
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    let rows = data ?? [];
    if (!all) {
      const now = Date.now();
      const lowerET = etDate(new Date(now - 3 * DAY)); // 3 days ago (Miami)
      const upperET = etDate(new Date(now + 1 * DAY)); // tomorrow (Miami)
      rows = rows.filter((a) => {
        if (!a.start_at) return false;
        const d = etDate(a.start_at);
        return d >= lowerET && d <= upperET;
      });
    }
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
