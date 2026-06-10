import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string; photoId: string }> };
const BUCKET = "project-photos";

/** PATCH — edit a photo's caption. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id, photoId } = await params;
    const b = await req.json();
    const update: Record<string, unknown> = {};
    if (b.caption !== undefined) update.caption = b.caption ? String(b.caption) : null;

    const { data, error } = await db()
      .from("project_photos")
      .update(update)
      .eq("id", photoId)
      .eq("project_id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** DELETE — remove the row AND its storage object (no cascade for storage). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, photoId } = await params;
    const client = db();

    const { data: row, error: selErr } = await client
      .from("project_photos")
      .select("storage_path")
      .eq("id", photoId)
      .eq("project_id", id)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (row?.storage_path) {
      await client.storage.from(BUCKET).remove([row.storage_path]);
    }

    const { error } = await client
      .from("project_photos")
      .delete()
      .eq("id", photoId)
      .eq("project_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
