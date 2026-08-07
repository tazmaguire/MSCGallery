"use client";
import { useState, useMemo } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

type Mode = "all" | "category" | "gallery";

export default function EmbedsForm({ galleries, categories, baseUrl }: {
  galleries: { id: string; slug: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  baseUrl: string;
}) {
  const [mode, setMode] = useState<Mode>("all");
  const [gallerySlug, setGallerySlug] = useState(galleries[0]?.slug || "");
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug || "");
  const [copied, setCopied] = useState(false);

  const path = mode === "all" ? "/embed/all" : mode === "category" ? `/embed/category/${categorySlug}` : `/embed/g/${gallerySlug}`;
  const src = `${baseUrl.replace(/\/$/, "")}${path}`;
  const snippet = useMemo(() =>
    `<iframe src="${src}" width="100%" height="720" style="border:0" loading="lazy" title="${mode === "gallery" ? galleries.find(g => g.slug === gallerySlug)?.name : "Galleries"} — photo gallery"></iframe>`,
  [src, mode, gallerySlug, galleries]);

  const copy = () => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const modeReady = mode === "all" || (mode === "category" && categorySlug) || (mode === "gallery" && gallerySlug);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="display mb-1 text-3xl">Embeds</h1>
      <p className="data mb-5 text-[var(--text-2)]">
        Drop a gallery, a category, or the whole listing into any other website — a partner site, a club homepage,
        anywhere that accepts a snippet of HTML. Visitors click through to view or download on {new URL(baseUrl).hostname}
        itself; nothing downloads inside the embed.
      </p>

      <div className="card mb-4 space-y-4 p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">What to embed</label>
          <div className="flex gap-1.5">
            {([["all", "All galleries"], ["category", "By category"], ["gallery", "Single gallery"]] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 rounded-[var(--radius)] px-3 py-2 text-xs font-medium transition ${mode === m ? "bg-[var(--text)] text-[var(--bg)]" : "border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "category" && (
          categories.length ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Category</label>
              <select value={categorySlug} onChange={e => setCategorySlug(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none">
                {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          ) : <p className="data text-[var(--text-3)]">No categories yet — add one from a gallery's Access panel first.</p>
        )}

        {mode === "gallery" && (
          galleries.length ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Gallery</label>
              <select value={gallerySlug} onChange={e => setGallerySlug(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none">
                {galleries.map(g => <option key={g.id} value={g.slug}>{g.name}</option>)}
              </select>
              <p className="data mt-1.5 text-[var(--text-3)]">Works even for unlisted galleries — only unpublished ones can't be embedded.</p>
            </div>
          ) : <p className="data text-[var(--text-3)]">No published galleries yet.</p>
        )}
      </div>

      {modeReady && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="data text-[var(--text-2)]">Paste this where you want it to appear</span>
            <a href={src} target="_blank" rel="noopener" className="data flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-2)]"><ExternalLink size={12} />Preview</a>
          </div>
          <pre className="data overflow-x-auto rounded-[var(--radius)] bg-[var(--bg-2)] p-3 text-[11px] leading-relaxed text-[var(--text-2)]">{snippet}</pre>
          <button onClick={copy} className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-sm">
            {copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy embed code</>}
          </button>
        </div>
      )}

      <p className="data text-[var(--text-3)]">
        Height is fixed at 720px above — most site builders let you adjust it after pasting. Embedded pages respect
        the same visibility rules as the site itself: password-protected galleries show a link out instead of the
        photos, and unpublished galleries can't be embedded at all.
      </p>
    </div>
  );
}
