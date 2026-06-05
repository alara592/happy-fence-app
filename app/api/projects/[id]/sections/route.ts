import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";

type Params = { params: Promise<{ id: string }> };

/** POST — add section (pure measurement; board prices are computed on read). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!(Number(b.linear_ft) > 0)) {
      return NextResponse.json({ error: "Linear Ft must be > 0" }, { status: 400 });
    }
    const blank = (v: unknown) => v === undefined || v === null || v === "";

    const { data, error } = await db()
      .from("project_sections")
      .insert({
        project_id: id,
        name: b.name.trim(),
        description: b.description || null,
        linear_ft: Number(b.linear_ft),
        tear_down: !!b.tear_down,
        dump: !!b.dump,
        take_down_ft: Number(b.take_down_ft ?? 0),
        tear_down_rate: blank(b.tear_down_rate) ? null : Number(b.tear_down_rate),
        dump_rate: blank(b.dump_rate) ? null : Number(b.dump_rate),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
