"use client";
import { useState, useMemo } from "react";
import Link from "next/link";

type GalleryTile = {
  id: string; slug: string; name: string; location: string | null;
  event_date: string | null; category: string | null; cover: string | null; brand: any;
};

const THUMB_FALLBACK = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#26292e"/><text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#888" text-anchor="middle" dy=".3em">No cover yet</text></svg>`
);
function onThumbError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallback) return;
  img.dataset.fallback = "1";
  img.src = THUMB_FALLBACK;
}

export default function GalleryGrid({ galleries, hideFilter, linkTarget }: { galleries: GalleryTile[]; hideFilter?: boolean; linkTarget?: string }) {
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const g of galleries) if (g.category && !seen.has(g.category)) { seen.add(g.category); list.push(g.category); }
    return list;
  }, [galleries]);
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? galleries.filter((g) => g.category === active) : galleries;

  return (
    <div>
      {!hideFilter && categories.length > 1 && (
        <div className="no-scrollbar mb-8 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setActive(null)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition ${!active ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setActive(c)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition ${active === c ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((g) => (
          <Link key={g.slug} href={`/g/${g.slug}`} target={linkTarget} rel={linkTarget === "_blank" ? "noopener" : undefined} className="group">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius)] bg-[var(--surface)]">
              {g.cover
                ? <img src={g.cover} alt="" onError={onThumbError} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                : <div className="grid h-full place-items-center"><span className="h-10 w-1 rounded-full" style={{ background: g.brand?.primary || "#E8442A" }} /></div>}
            </div>
            <div className="mt-3">
              <h2 className="display text-lg leading-tight">{g.name}</h2>
              <p className="data mt-1 text-[var(--text-3)]">
                {g.event_date && new Date(g.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {g.event_date && g.category && "  ·  "}
                {g.category}
              </p>
            </div>
          </Link>
        ))}
        {!shown.length && <p className="data col-span-full py-16 text-center text-[var(--text-2)]">No galleries in this category yet.</p>}
      </div>
    </div>
  );
}
