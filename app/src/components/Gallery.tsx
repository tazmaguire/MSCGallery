"use client";
/**
 * Public gallery — the showpiece. Warm material darks, condensed display
 * type, race-timing mono for data. Photos are the hero. Two levels: album
 * covers → photos. Downloads at photo / album / gallery. "Shot by Sarah".
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { Download, X, ChevronLeft, ChevronRight, Play, ArrowLeft, ShoppingCart, Check, Trash2, ExternalLink } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import SiteHeader from "@/components/SiteHeader";
import DownloadPinModal from "@/components/DownloadPinModal";
import type { DisplayMode } from "@/lib/siteIdentity";

type Asset = { id: string; kind: "photo" | "video"; width: number; height: number; contributor_id: string; firstName: string; contributorLink: string | null; download_filename: string; download_url: string; thumb: string; preview: string };
type Album = { id: string; name: string; slug: string; cover: string | null; count: number };

// Swaps a broken thumbnail/preview <img> for an inline placeholder instead of
// the browser's default broken-image icon. data:-fallback.dataset guards
// against looping if the placeholder itself somehow fails.
const THUMB_FALLBACK = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#26292e"/><text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#888" text-anchor="middle" dy=".3em">Image unavailable</text></svg>`
);
function onThumbError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallback) return;
  img.dataset.fallback = "1";
  img.src = THUMB_FALLBACK;
}

export default function Gallery({ gallerySlug, galleryName, eventDate, location, intro, albums, assetsByAlbum, contributors, brand, siteName, siteLogoUrl, siteDisplayMode, coverUrl, downloadMode, downloadUnlocked }: {
  gallerySlug: string; galleryName: string; eventDate: string; location: string; intro?: string;
  albums: Album[]; assetsByAlbum: Record<string, Asset[]>; contributors: { id: string; name: string; count: number }[];
  brand: { primary: string; accent: string; logo?: string };
  siteName: string; siteLogoUrl: string | null; siteDisplayMode?: DisplayMode; coverUrl?: string | null;
  downloadMode: "open" | "pin"; downloadUnlocked: boolean;
}) {
  const single = albums.length === 1;
  const [openAlbum, setOpenAlbum] = useState<string | null>(single ? albums[0]?.id : null);
  const [lb, setLb] = useState<{ album: string; i: number } | null>(null);
  const style = { ["--brand" as any]: brand.primary, ["--accent" as any]: brand.accent } as React.CSSProperties;

  // Click a "SHOT BY" name to see just that person's photos in this album;
  // an obvious, dedicated way to clear it again lives right above the grid
  // — no toggling-by-reclicking, so the two actions (filter / clear) never
  // get confused with each other.
  const [filterContributor, setFilterContributor] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => { setFilterContributor(null); }, [openAlbum]);

  // Cart — pick individual photos across albums, download just those later.
  // Lives in localStorage, scoped to this gallery, so it survives a refresh.
  // Download-only: no payment, no server-side cart state (see db/004_orders_stub.sql
  // for where a future paid flow would attach — unused today).
  const CART_MAX = 200;
  const cartKey = `cart:${gallerySlug}`;
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  const showToast = (msg: string, ms = 3000) => { setToast(msg); setTimeout(() => setToast(""), ms); };
  useEffect(() => {
    try { setCart(new Set(JSON.parse(localStorage.getItem(cartKey) || "[]"))); } catch {}
  }, [cartKey]);
  const persistCart = (next: Set<string>) => {
    setCart(next);
    try { localStorage.setItem(cartKey, JSON.stringify([...next])); } catch {}
  };
  const toggleCart = (id: string) => {
    const next = new Set(cart);
    if (next.has(id)) { next.delete(id); }
    else {
      if (next.size >= CART_MAX) { showToast(`You can add up to ${CART_MAX} photos to your cart at once — download this batch first.`, 5000); return; }
      next.add(id);
    }
    persistCart(next);
  };

  // Per-gallery download PIN gate (db/013_download_restrictions.sql) —
  // separate from browsing, which stays open regardless. `requestDownload`
  // is a no-op passthrough in "open" mode (the overwhelming majority of
  // galleries), so the hot path is unaffected.
  const [dlUnlocked, setDlUnlocked] = useState(downloadUnlocked);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const pendingDownload = useRef<(() => void) | null>(null);
  const requestDownload = (action: () => void) => {
    if (downloadMode !== "pin" || dlUnlocked) { action(); return; }
    pendingDownload.current = action;
    setPinModalOpen(true);
  };
  const onPinUnlocked = () => { setDlUnlocked(true); setPinModalOpen(false); pendingDownload.current?.(); pendingDownload.current = null; };
  const blockSave = (e: React.SyntheticEvent) => { e.preventDefault(); showToast("You can't do this."); };
  const clearCart = () => persistCart(new Set());
  const cartDownloadUrl = `/g/${gallerySlug}/download?${[...cart].map((id) => `id=${id}`).join("&")}`;
  // Cart items can come from any album, so resolve against everything
  // currently loaded, not just the open album.
  const allAssetsById = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const list of Object.values(assetsByAlbum)) for (const a of list) m.set(a.id, a);
    return m;
  }, [assetsByAlbum]);
  const cartItems = [...cart].map((id) => allAssetsById.get(id)).filter(Boolean) as Asset[];

  // Bib/tag search UI is pulled for now (feature not ready) — the backend
  // (asset_tags, api/gallery/[slug]/search) stays in place for when it is.

  const album = albums.find((a) => a.id === openAlbum) || null;
  const albumAssets = openAlbum ? assetsByAlbum[openAlbum] || [] : [];
  // Matched by displayed first name, not contributor_id: guest uploaders get a
  // new contributors row per upload session (no cross-session dedup server-side),
  // so the same person visiting twice ends up with two different ids — filtering
  // by id would silently miss half their photos. First-name matching is scoped
  // to this gallery/album, not global, so the (accepted) tradeoff is two different
  // people who share a first name being merged in the filtered view.
  const assets = filterContributor ? albumAssets.filter((a) => a.firstName === filterContributor.name) : albumAssets;
  // Once a filter's active, paging through the lightbox stays within it too —
  // "browsing Sarah's photos" shouldn't suddenly show everyone else's.
  const lbList = lb
    ? (filterContributor ? (assetsByAlbum[lb.album] || []).filter((a) => a.firstName === filterContributor.name) : assetsByAlbum[lb.album] || [])
    : [];
  const current = lb ? lbList[lb.i] : null;

  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (e.key === "ArrowRight") setLb((l) => l && { ...l, i: Math.min(l.i + 1, lbList.length - 1) });
      if (e.key === "ArrowLeft") setLb((l) => l && { ...l, i: Math.max(l.i - 1, 0) });
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [lb, lbList.length]);

  // Preload neighbours (2048px preview, never the full-res original) so paging feels instant.
  useEffect(() => {
    if (!lb) return;
    for (const idx of [lb.i - 1, lb.i + 1]) {
      const item = lbList[idx];
      if (item && item.kind === "photo") { const img = new window.Image(); img.src = item.preview; }
    }
  }, [lb, lbList]);

  // Swipe left/right on touch devices.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !lb) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && lb.i < lbList.length - 1) setLb({ ...lb, i: lb.i + 1 });
    if (dx > 0 && lb.i > 0) setLb({ ...lb, i: lb.i - 1 });
  };

  const dl = (url: string, name: string) => { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  const totalPhotos = Object.values(assetsByAlbum).reduce((n, a) => n + a.length, 0);

  const crumbs = !single && album
    ? [{ label: "Home", href: "/" }, { label: galleryName, href: `/g/${gallerySlug}` }, { label: album.name }]
    : [{ label: "Home", href: "/" }, { label: galleryName }];

  return (
    <div className="min-h-screen" style={style}>
      <SiteHeader siteName={siteName} logoUrl={siteLogoUrl} displayMode={siteDisplayMode} crumbs={crumbs} />
      {!album && (
        <header className="relative overflow-hidden border-b border-[var(--border)]">
          {coverUrl && <>
            <img src={coverUrl} alt="" onError={onThumbError} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/70 to-[var(--bg)]/20" />
          </>}
          <div className="absolute right-6 top-6 flex items-center gap-3">{brand.logo && <img src={brand.logo} alt="" className="h-12 w-auto opacity-90" />}<ThemeToggle /></div>
          <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-16 sm:pt-24">
            <div className="eyebrow mb-4">{location}{location && eventDate && " · "}{eventDate}</div>
            <h1 className="display text-3xl sm:text-4xl lg:text-5xl">{galleryName}</h1>
            {intro && <p className="mt-6 max-w-xl text-[var(--text-2)]">{intro}</p>}
            <div className="data mt-6 flex gap-6 text-[var(--text-2)]">
              <span><span className="text-[var(--text)]">{totalPhotos}</span> photos</span>
              <span><span className="text-[var(--text)]">{albums.length}</span> {albums.length === 1 ? "album" : "albums"}</span>
              <span><span className="text-[var(--text)]">{contributors.length}</span> contributors</span>
            </div>
          </div>
        </header>
      )}

      {album && (
        <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                {!single && <button onClick={() => setOpenAlbum(null)} className="eyebrow mb-1 flex items-center gap-1.5 transition hover:text-[var(--text)]"><ArrowLeft size={12} /> All albums</button>}
                <h1 className="display truncate text-3xl sm:text-4xl">{album.name}</h1>
                <p className="data mt-0.5 text-[var(--text-2)]">{album.count} photos</p>
              </div>
              {filterContributor && (
                <button onClick={() => setFilterContributor(null)} className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-sm transition hover:bg-[var(--border)]">
                  Shot by {filterContributor.name} <X size={13} />
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">
        {!album && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Albums</div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((al) => (
                <button key={al.id} onClick={() => setOpenAlbum(al.id)} className="group text-left">
                  <div className="relative aspect-[3/2] overflow-hidden rounded-[var(--radius)] bg-[var(--surface)]">
                    {al.cover ? <img src={al.cover} alt="" onError={onThumbError} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="data grid h-full place-items-center text-[var(--text-3)]">no photos yet</div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                      <h2 className="display text-2xl text-white drop-shadow">{al.name}</h2>
                      <span className="data rounded bg-black/40 px-2 py-0.5 text-white/90 backdrop-blur">{al.count}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {album && (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
            {assets.map((a) => (
              <figure key={a.id} className={`group relative break-inside-avoid overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] ${cart.has(a.id) ? "ring-2 ring-[var(--brand)]" : ""}`}>
                <img src={a.thumb} alt="" loading="lazy" width={a.width} height={a.height} onError={onThumbError} onClick={() => setLb({ album: album.id, i: assets.indexOf(a) })} onContextMenu={blockSave} draggable={false} className="w-full select-none cursor-zoom-in transition duration-300 group-hover:opacity-95 [-webkit-touch-callout:none]" />
                {a.kind === "video" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="rounded-full bg-black/50 p-3 backdrop-blur"><Play size={18} fill="white" /></div></div>}
                <button onClick={(e) => { e.stopPropagation(); toggleCart(a.id); }} title={cart.has(a.id) ? "Remove from cart" : "Add to cart"}
                  className={`absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition focus:opacity-100 ${cart.has(a.id) ? "bg-[var(--brand)] text-white opacity-100" : "bg-black/40 text-white/90 opacity-0 group-hover:opacity-100"}`}>
                  {cart.has(a.id) ? <Check size={15} /> : <ShoppingCart size={15} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); requestDownload(() => dl(a.download_url, a.download_filename)); }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100" title="Download"><Download size={15} /></button>
                <figcaption className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/40 py-1 pl-2.5 pr-1.5 text-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); setFilterContributor({ id: a.contributor_id, name: a.firstName }); }} className="data text-[11px] hover:underline" title={`See all photos by ${a.firstName}`}>SHOT BY {a.firstName}</button>
                  {a.contributorLink && <a href={a.contributorLink} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title={`${a.firstName}'s link`} className="text-white/70 hover:text-white"><ExternalLink size={11} /></a>}
                </figcaption>
              </figure>
            ))}
            {!assets.length && <p className="data col-span-full py-24 text-center text-[var(--text-2)]">Nothing here yet.</p>}
          </div>
        )}
      </main>

      {current && (
        <div className="viewer-backdrop fixed inset-0 z-50 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="data text-white/60">{lb!.i + 1} / {lbList.length}</span>
            <button onClick={() => setLb(null)} className="p-2 text-white/60 transition hover:text-white"><X size={22} /></button>
          </div>
          <div className="relative flex flex-1 items-center justify-center px-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {lb!.i > 0 && <button onClick={() => setLb({ ...lb!, i: lb!.i - 1 })} className="absolute left-2 z-10 rounded-full bg-white/10 p-2 transition hover:bg-white/20"><ChevronLeft size={24} /></button>}
            {current.kind === "video" ? <video src={current.download_url} controls autoPlay onContextMenu={blockSave} className="max-h-[72vh] max-w-full" /> : <img src={current.preview} alt="" draggable={false} onError={onThumbError} onContextMenu={blockSave} className="max-h-[72vh] max-w-full select-none object-contain [-webkit-touch-callout:none]" />}
            {lb!.i < lbList.length - 1 && <button onClick={() => setLb({ ...lb!, i: lb!.i + 1 })} className="absolute right-2 z-10 rounded-full bg-white/10 p-2 transition hover:bg-white/20"><ChevronRight size={24} /></button>}
          </div>
          <div className="border-t border-white/15 px-5 py-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="data flex items-center gap-1.5 text-white/90">
                  <span className="text-white/60">SHOT BY</span>
                  <button onClick={() => { setFilterContributor({ id: current.contributor_id, name: current.firstName }); setLb(null); }} className="hover:underline" title={`See all photos by ${current.firstName}`}>{current.firstName}</button>
                  {current.contributorLink && <a href={current.contributorLink} target="_blank" rel="noopener" title={`${current.firstName}'s link`} className="text-white/60 hover:text-white"><ExternalLink size={12} /></a>}
                </span>
                <span className="data text-white/60">{current.width} × {current.height}</span>
              </div>
              <p className="data text-white/45">You're viewing a preview — download the full-size file below, it's free.</p>
              <div className="flex gap-3">
                <button onClick={() => toggleCart(current.id)} className={`flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-4 text-base transition ${cart.has(current.id) ? "bg-[var(--brand)] text-white" : "border border-white/20 text-white/90 hover:bg-white/10"}`} title={cart.has(current.id) ? "Remove from cart" : "Add to cart"}>
                  {cart.has(current.id) ? <Check size={18} /> : <ShoppingCart size={18} />}
                </button>
                {/* Always the photo currently open (`current`, from lbList[lb.i]) — never
                    the cart. Cart selection has no bearing on this button whatsoever;
                    it's a completely separate piece of state. */}
                <button onClick={() => requestDownload(() => dl(current.download_url, current.download_filename))} className="btn-primary flex flex-1 items-center justify-center gap-2 px-5 py-4 text-base"><Download size={18} /> Download full resolution — free</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Always visible — not just when the cart has items — so it reads as a
          permanent feature of the gallery, not something that appears out of
          nowhere. */}
      <button onClick={() => setCartOpen(true)} className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-3 text-white shadow-2xl transition hover:brightness-110" title="Cart">
        <ShoppingCart size={18} />
        <span className="text-sm font-bold">{cart.size}</span>
      </button>

      {toast && (
        <div className="fixed bottom-20 right-4 z-40 max-w-xs rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-2xl">{toast}</div>
      )}

      {pinModalOpen && <DownloadPinModal gallerySlug={gallerySlug} onSuccess={onPinUnlocked} onClose={() => setPinModalOpen(false)} />}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setCartOpen(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-[var(--surface)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="display text-xl">Cart ({cart.size})</h2>
              <button onClick={() => setCartOpen(false)} className="p-1 text-[var(--text-2)] transition hover:text-[var(--text)]"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {cartItems.length > 0 ? (
                <div className="space-y-2">
                  {cartItems.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-2)] p-2">
                      <img src={a.thumb} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                      <span className="data min-w-0 flex-1 truncate text-[var(--text-2)]">SHOT BY {a.firstName}</span>
                      <button onClick={() => toggleCart(a.id)} className="shrink-0 p-1 text-[var(--text-3)] transition hover:text-[var(--brand)]" title="Remove"><X size={16} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="data py-12 text-center text-[var(--text-2)]">Your cart is empty. Tap the cart icon on any photo to add it.</p>
              )}
            </div>
            {cart.size > 0 && (
              <div className="space-y-2 border-t border-[var(--border)] p-4">
                {downloadMode === "pin" && !dlUnlocked ? (
                  <button onClick={() => requestDownload(() => { window.location.href = cartDownloadUrl; })} className="btn-primary flex w-full items-center justify-center gap-2 py-3"><Download size={16} /> Download all ({cart.size})</button>
                ) : (
                  <a href={cartDownloadUrl} className="btn-primary flex w-full items-center justify-center gap-2 py-3"><Download size={16} /> Download all ({cart.size})</a>
                )}
                <button onClick={clearCart} className="btn-ghost flex w-full items-center justify-center gap-2 py-2.5 text-sm"><Trash2 size={14} /> Clear cart</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
