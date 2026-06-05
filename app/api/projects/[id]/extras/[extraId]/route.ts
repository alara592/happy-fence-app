import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string; extraId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id, extraId } = await params;
    const { error } = await db()
      .from("project_extras")
      .delete()
      .eq("id", extraId)
      .eq("project_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
