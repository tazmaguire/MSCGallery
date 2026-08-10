import { q } from "@/lib/db"; import { downloadFilename, firstName } from "@/lib/naming";
import Gallery from "@/components/Gallery"; import { notFound } from "next/navigation";
import { googleFontsHref, fontStack } from "@/lib/fonts";
import { siteConfig } from "@/lib/siteConfig";
import { cookies } from "next/headers";
import { checkGalleryAccess, checkDownloadAccess } from "@/lib/security";
import GalleryPasswordGate from "@/components/GalleryPasswordGate";
export const dynamic = "force-dynamic";
export default async function P({ params }: { params: { slug: string } }) {
  const [g] = await q(`SELECT * FROM galleries WHERE slug=$1 AND is_published`, [params.slug]); if (!g) notFound();
  const site = await siteConfig();
  if (g.view_password_hash && !checkGalleryAccess(cookies().get(`gv_${g.id}`)?.value, g.id))
    return <GalleryPasswordGate slug={g.slug} galleryName={g.name} siteName={site.name} />;
  // db/013_download_restrictions.sql — g is SELECT *, so download_mode is
  // simply undefined on an unmigrated DB and this falls back to "open" for free.
  const downloadMode: "open" | "pin" = g.download_mode === "pin" ? "pin" : "open";
  const downloadUnlocked = downloadMode === "pin" ? checkDownloadAccess(cookies().get(`dp_${g.id}`)?.value, g.id) : true;
  const albums = await q(
    `SELECT al.id, al.name, al.slug,
            (SELECT count(*) FROM assets a WHERE a.album_id=al.id AND a.visibility='visible' AND a.status='ready' AND (a.deletion_status IS NULL OR a.deletion_status='')) AS count
     FROM albums al WHERE al.gallery_id=$1 AND al.is_private=false ORDER BY al.sort_order`, [g.id]);

  // Custom covers (db/002_customisation.sql) — best-effort: an older DB that
  // hasn't had the migration applied yet just falls back to no custom cover.
  const albumCoverThumb: Record<string, string> = {};
  let galleryCoverThumb: string | null = null;
  // Cover asset must pass the same public-visibility rule as everything else —
  // a photo picked as a cover before approval (or later rejected/deleted)
  // must not leak out through the cover slot.
  const COVER_VISIBLE = `cov.visibility='visible' AND cov.status='ready' AND (cov.deletion_status IS NULL OR cov.deletion_status='')`;
  try {
    const covRows = await q(`SELECT al.id, cov.thumb_key FROM albums al JOIN assets cov ON cov.id = al.cover_asset_id WHERE al.gallery_id=$1 AND ${COVER_VISIBLE}`, [g.id]);
    for (const r of covRows) if (r.thumb_key) albumCoverThumb[r.id] = r.thumb_key;
  } catch {}
  try {
    const [gc] = await q(`SELECT COALESCE(cov.preview_key, cov.poster_key, cov.thumb_key) AS k FROM galleries gal JOIN assets cov ON cov.id = gal.cover_asset_id WHERE gal.id=$1 AND ${COVER_VISIBLE}`, [g.id]);
    galleryCoverThumb = gc?.k || null;
  } catch {}
  const withPhotos = albums.filter((a: any) => Number(a.count) > 0);
  let rows;
  try {
    rows = await q(
      `SELECT a.id, a.kind, a.width, a.height, a.taken_at, a.public_key, a.album_id, a.thumb_key, a.preview_key, a.poster_key, a.contributor_id,
              COALESCE(c.credit_line, c.display_name) AS contributor_name, c.first_name, c.link_url AS contributor_link,
              row_number() OVER (PARTITION BY a.album_id ORDER BY a.taken_at, a.created_at) AS seq
       FROM assets a JOIN contributors c ON c.id=a.contributor_id JOIN albums al ON al.id=a.album_id
       WHERE a.gallery_id=$1 AND a.visibility='visible' AND a.status='ready' AND al.is_private=false AND a.deletion_status IS NULL
       ORDER BY a.taken_at DESC NULLS LAST, a.created_at DESC`, [g.id]);
  } catch {
    // db/010_contributor_link.sql not applied yet.
    rows = await q(
      `SELECT a.id, a.kind, a.width, a.height, a.taken_at, a.public_key, a.album_id, a.thumb_key, a.preview_key, a.poster_key, a.contributor_id,
              COALESCE(c.credit_line, c.display_name) AS contributor_name, c.first_name,
              row_number() OVER (PARTITION BY a.album_id ORDER BY a.taken_at, a.created_at) AS seq
       FROM assets a JOIN contributors c ON c.id=a.contributor_id JOIN albums al ON al.id=a.album_id
       WHERE a.gallery_id=$1 AND a.visibility='visible' AND a.status='ready' AND al.is_private=false AND a.deletion_status IS NULL
       ORDER BY a.taken_at DESC NULLS LAST, a.created_at DESC`, [g.id]);
  }
  const assetsByAlbum: Record<string, any[]> = {}; const cc = new Map<string, any>();
  for (const r of rows) {
    const ext = r.kind === "video" ? "mp4" : "jpg";
    const fn = downloadFilename({ shortCode: g.short_code, location: g.location, contributor: r.contributor_name, seq: Number(r.seq), ext });
    const a = { id: r.id, kind: r.kind, width: r.width, height: r.height, contributor_id: r.contributor_id,
      firstName: r.first_name || firstName(r.contributor_name), contributorLink: r.contributor_link || null,
      download_filename: fn, download_url: `/d/${r.id}`,
      thumb: `/thumbs/thumb/${r.thumb_key}`, preview: `/thumbs/preview/${r.preview_key || r.poster_key}` };
    (assetsByAlbum[r.album_id] ||= []).push(a);
    const c = cc.get(r.contributor_id) ?? { id: r.contributor_id, name: r.first_name || firstName(r.contributor_name), count: 0 }; c.count++; cc.set(r.contributor_id, c);
  }
  const albumsOut = withPhotos.map((al: any) => ({
    id: al.id, name: al.name, slug: al.slug, count: Number(al.count),
    cover: (albumCoverThumb[al.id] && `/thumbs/thumb/${albumCoverThumb[al.id]}`) || assetsByAlbum[al.id]?.[0]?.thumb || null,
  }));
  const fonts = { display: g.brand?.fontDisplay, body: g.brand?.fontBody, mono: g.brand?.fontMono };
  const fontHref = googleFontsHref(fonts);
  const fontVars: any = {};
  if (g.brand?.fontDisplay) fontVars["--font-display"] = fontStack(g.brand.fontDisplay, "system-ui, sans-serif");
  if (g.brand?.fontBody) fontVars["--font-body"] = fontStack(g.brand.fontBody, "system-ui, sans-serif");
  if (g.brand?.fontMono) fontVars["--font-mono"] = fontStack(g.brand.fontMono, "ui-monospace, monospace");
  return <>
    {fontHref && <link href={fontHref} rel="stylesheet" />}
    <div style={fontVars}>
    <Gallery gallerySlug={g.slug} galleryName={g.name}
    eventDate={g.event_date ? new Date(g.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ""}
    location={g.location || ""} intro={g.brand?.intro} albums={albumsOut} assetsByAlbum={assetsByAlbum}
    contributors={[...cc.values()].sort((a, b) => b.count - a.count)}
    brand={{ primary: g.brand?.primary || "#E8442A", accent: g.brand?.accent || "#D6E04B", logo: g.brand?.logo_key }}
    coverUrl={galleryCoverThumb ? `/thumbs/preview/${galleryCoverThumb}` : null}
    downloadMode={downloadMode} downloadUnlocked={downloadUnlocked}
    siteName={site.name} siteLogoUrl={site.logoUrl} siteDisplayMode={site.displayMode} />
    </div>
  </>;
}