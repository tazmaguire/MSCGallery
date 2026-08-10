import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { pendingCount } from "@/lib/moderation";

export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  return NextResponse.json({ n: await pendingCount() });
}
