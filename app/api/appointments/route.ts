import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

/** GET — appointment list, most recent visit first. Site visits become quotes
 *  after the fact, so newest-first matches the "just visited → now quote it" flow. */
export async function GET() {
  try {
    const { data, error } = await db()
      .from("appointments")
      .select(
        "id, client, address, start_at, end_at, status, notes, project_id, meeting_title",
      )
      .order("start_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
