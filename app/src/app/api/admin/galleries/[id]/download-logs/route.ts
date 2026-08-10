import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) return NextResponse.json({ error: "no" }, { status: 401 });
  try {
    const logs = await q(
      `SELECT dl.id, dl.name, dl.email, dl.kind, dl.created_at,
              a.original_filename, al.name AS album_name
       FROM download_logs dl
       LEFT JOIN assets a ON a.id = dl.asset_id
       LEFT JOIN albums al ON al.id = a.album_id
       WHERE dl.gallery_id = $1
       ORDER BY dl.created_at DESC
       LIMIT 200`,
      [params.id]
    );
    return NextResponse.json({ logs });
  } catch {
    // db/014_download_logs.sql not applied yet — degrade to empty rather than 500.
    return NextResponse.json({ logs: [] });
  }
}
