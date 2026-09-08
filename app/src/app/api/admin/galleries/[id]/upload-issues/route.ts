import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { uploadIssues } from "@/lib/moderation";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const issues = await uploadIssues(params.id);
  return NextResponse.json({ issues });
}
