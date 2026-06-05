import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { loadReference } from "@/lib/server/reference";
import { normalizeProject, priceSection } from "@/lib/server/projects";
import type { SectionInput } from "@/lib/pricing";

type Params = { params: Promise<{ id: string }> };

function bodyToSectionInput(b: Record<string, unknown>): SectionInput {
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  return {
    linearFt: Number(b.linear_ft),
    type: String(b.type),
    tearDown: !!b.tear_down,
    dump: !!b.dump,
    takeDownFt: Number(b.take_down_ft ?? 0),
    tearDownRate: blank(b.tear_down_rate) ? null : Number(b.tear_down_rate),
    dumpRate: blank(b.dump_rate) ? null : Number(b.dump_rate),
  };
}

/** POST — add section; price computed by lib/pricing.ts at save (spec §4). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!b.type) return NextResponse.json({ error: "Type is required" }, { status: 400 });
    if (!(Number(b.linear_ft) > 0)) {
      return NextResponse.json({ error: "Linear Ft must be > 0" }, { status: 400 });
    }

    const [{ data: proj, error: projErr }, ref] = await Promise.all([
      db().from("projects").select("*").eq("id", id).single(),
      loadReference(),
    ]);
    if (projErr || !proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const input = bodyToSectionInput(b);
    const actual_price = priceSection(input, normalizeProject(proj), ref);

    const { data, error } = await db()
      .from("project_sections")
      .insert({
        project_id: id,
        name: b.name.trim(),
        description: b.description || null,
        type: input.type,
        linear_ft: input.linearFt,
        tear_down: input.tearDown,
        dump: input.dump,
        take_down_ft: input.takeDownFt,
        tear_down_rate: input.tearDownRate,
        dump_rate: input.dumpRate,
        actual_price,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
