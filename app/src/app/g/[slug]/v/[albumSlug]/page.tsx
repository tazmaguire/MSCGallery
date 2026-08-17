import { q } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { checkGalleryAccess } from "@/lib/security";
import { parseVideoUrl, embedSrc } from "@/lib/videoEmbed";
import { siteConfig } from "@/lib/siteConfig";
import SiteHeader from "@/components/SiteHeader";
import GalleryPasswordGate from "@/components/GalleryPasswordGate";

export const dynamic = "force-dynamic";

export default async function P({ params }: { params: { slug: string; albumSlug: string } }) {
  const [g] = await q(`SELECT * FROM galleries WHERE slug=$1 AND is_published`, [params.slug]);
  if (!g) notFound();
  const site = await siteConfig();
  if (g.view_password_hash && !checkGalleryAccess(cookies().get(`gv_${g.id}`)?.value, g.id))
    return <GalleryPasswordGate slug={g.slug} galleryName={g.name} siteName={site.name} />;

  // db/016_video_showcase_album.sql — on an unmigrated DB the is_showcase
  // column doesn't exist at all, so this throws; there's nothing sensible
  // to fall back to (no showcase albums can exist yet either way), so a 404
  // is exactly the right degrade.
  let album: any;
  try {
    [album] = await q(`SELECT * FROM albums WHERE gallery_id=$1 AND slug=$2 AND is_showcase=true`, [g.id, params.albumSlug]);
  } catch { notFound(); }
  if (!album) notFound();
  // Hidden = not reachable at all, same as an unpublished gallery. Unlisted
  // deliberately does NOT gate this route — that's the whole point of
  // "unlisted": reachable by direct link, just excluded from the album grid
  // (enforced on that listing query instead, not here).
  if (album.is_private) notFound();

  const showcase = album.showcase || {};
  const ref = showcase.videoUrl ? parseVideoUrl(showcase.videoUrl) : null;
  if (!ref) notFound(); // not configured with a valid video yet — nothing to show

  return (
    <div className="min-h-screen">
      <SiteHeader siteName={site.name} logoUrl={site.logoUrl} displayMode={site.displayMode}
        crumbs={[{ label: "All albums", href: `/g/${g.slug}` }, { label: album.name }]} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="display mb-6 text-3xl">{album.name}</h1>
        <div className="aspect-video w-full overflow-hidden rounded-[var(--radius)] bg-black">
          <iframe
            src={embedSrc(ref, !!showcase.autoplay)}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        {showcase.captionHtml && (
          <div className="data mt-6 text-[15px] leading-relaxed text-[var(--text-2)] [&_a]:text-[var(--accent)] [&_a]:underline [&_b]:text-[var(--text)] [&_strong]:text-[var(--text)]"
            dangerouslySetInnerHTML={{ __html: showcase.captionHtml }} />
        )}
      </main>
    </div>
  );
}
