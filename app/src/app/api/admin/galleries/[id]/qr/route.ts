import { NextRequest } from "next/server";
import { q } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { resolveConfig } from "@/lib/secrets";
import QRCode from "qrcode";
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(); if (!user) return new Response("no", { status: 401 });
  const token = new URL(req.url).searchParams.get("token"); // which link's QR
  if (!token) return new Response("token required", { status: 400 });
  const base = (await resolveConfig("public_site_url", "PUBLIC_SITE_URL")) || `https://${req.headers.get("host")}`;
  const svg = await QRCode.toString(`${base}/u/${token}`, { type: "svg", margin: 2, width: 512,
    color: { dark: "#17181A", light: "#F2EFE9" } });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
}
