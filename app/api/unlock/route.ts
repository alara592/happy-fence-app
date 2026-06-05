import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, pinToken } from "@/lib/auth-token";

/** PIN check — the only unauthenticated endpoint (spec D1). */
export async function POST(req: NextRequest) {
  const { pin } = await req.json().catch(() => ({ pin: "" }));
  const expected = process.env.APP_PIN;
  if (!expected) {
    return NextResponse.json({ error: "APP_PIN not configured" }, { status: 500 });
  }
  if (typeof pin !== "string" || pin !== expected) {
    await new Promise((r) => setTimeout(r, 750)); // dampen brute force
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await pinToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, // remembered per device
    path: "/",
  });
  return res;
}
