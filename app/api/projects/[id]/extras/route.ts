import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string }> };

/** POST — add extra from the catalog; name+price copied at add time. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    if (!b.extra_id) return NextResponse.json({ error: "Pick an extra" }, { status: 400 });

    const { data: cat, error: catErr } = await db()
      .from("extras")
      .select("*")
      .eq("id", b.extra_id)
      .single();
    if (catErr || !cat) return NextResponse.json({ error: "Extra not found" }, { status: 404 });

    const { data, error } = await db()
      .from("project_extras")
      .insert({ project_id: id, extra_id: cat.id, name: cat.name, price: cat.price })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
