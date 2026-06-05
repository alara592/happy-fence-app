import { NextResponse } from "next/server";
import { loadReference } from "@/lib/server/reference";

/** Price tables + settings for dropdowns and price previews. */
export async function GET() {
  try {
    return NextResponse.json(await loadReference());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
