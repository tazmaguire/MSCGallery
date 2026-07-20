import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { audit, clientIp, hashIp } from "@/lib/security";
export async function POST(req: NextRequest) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  const { assetIds, action } = await req.json();
  const iph = hashIp(clientIp(req));
  if (action === "approve") {
    await q(`UPDATE assets SET visibility='visible', moderated_at=now(), moderated_by=$2
             WHERE id = ANY($1::uuid[]) AND status='ready' AND visibility='pending' AND (deletion_status IS NULL OR deletion_status='')`, [assetIds, user.id]);
    await audit(user.id, "approve", { count: assetIds.length }, iph);
    return NextResponse.json({ approved: assetIds.length });
  }
  if (action === "reject") {
    await q(`UPDATE assets SET visibility='rejected', moderated_at=now(), moderated_by=$2 WHERE id = ANY($1::uuid[]) AND (deletion_status IS NULL OR deletion_status='')`, [assetIds, user.id]);
    await audit(user.id, "reject", { count: assetIds.length }, iph);
    return NextResponse.json({ rejected: assetIds.length });
  }
  if (action === "requeue") {
    await q(`UPDATE assets SET visibility='pending' WHERE id = ANY($1::uuid[]) AND (deletion_status IS NULL OR deletion_status='')`, [assetIds]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
