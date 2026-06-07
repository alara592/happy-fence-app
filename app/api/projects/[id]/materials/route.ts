import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string }> };

/** POST — add a material to the project's price board. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    if (!b.type) return NextResponse.json({ error: "Pick a material" }, { status: 400 });

    // Auto-activate when the board has no Active fence yet (saves a "Set active" tap on
    // the common single-material job; partial unique index allows one active per project).
    const { data: activeExisting } = await db()
      .from("project_materials")
      .select("id")
      .eq("project_id", id)
      .eq("is_active", true)
      .maybeSingle();

    const { data, error } = await db()
      .from("project_materials")
      .insert({ project_id: id, type: b.type, is_active: !activeExisting })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Already on the board" }, { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
