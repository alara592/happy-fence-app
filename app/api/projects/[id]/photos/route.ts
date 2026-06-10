import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string }> };
const BUCKET = "project-photos";

/**
 * POST — add a site photo. Body: { dataUrl: "data:image/...;base64,...", caption? }.
 * The image is already downscaled client-side (lib/image.ts), so only ~300 KB lands here.
 * We decode it, upload to the private bucket under {projectId}/{uuid}.jpg, and record a row.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    const dataUrl: string = b.dataUrl ?? "";
    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });

    const contentType = m[1];
    const bytes = Buffer.from(m[2], "base64");
    // Client compresses to ~300 KB; guard against an oversized/raw payload slipping through.
    if (bytes.length > 8_000_000) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const ext = contentType === "image/png" ? "png" : "jpg";
    const path = `${id}/${randomUUID()}.${ext}`;
    const client = db();

    const up = await client.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (up.error) throw new Error(up.error.message);

    // Append after the current last photo.
    const { data: last } = await client
      .from("project_photos")
      .select("sort_order")
      .eq("project_id", id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextSort = last && last.length ? Number(last[0].sort_order) + 1 : 0;

    const { data, error } = await client
      .from("project_photos")
      .insert({
        project_id: id,
        storage_path: path,
        caption: b.caption ? String(b.caption) : null,
        sort_order: nextSort,
      })
      .select()
      .single();
    if (error) {
      // Don't leave an orphaned object if the row insert fails.
      await client.storage.from(BUCKET).remove([path]);
      throw new Error(error.message);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
