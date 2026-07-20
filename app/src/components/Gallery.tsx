"use client";
/**
 * Public gallery — the showpiece. Warm material darks, condensed display
 * type, race-timing mono for data. Photos are the hero. Two levels: album
 * covers → photos. Downloads at photo / album / gallery. "Shot by Sarah".
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { Download, X, ChevronLeft, ChevronRight, Play, ArrowLeft, ShoppingCart, Check, Trash2, Search } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import SiteHeader from "@/components/SiteHeader";

type Asset = { id: string; kind: "photo" | "video"; width: number; height: number; contributor_id: string; firstName: string; download_filename: string; download_url: string; thumb: string; preview: string };
type Album = { id: string; name: string; slug: string; cover: string | null; count: number };

export default function Gallery({ gallerySlug, galleryName, eventDate, location, intro, albums, assetsByAlbum, contributors, brand, siteName, siteLogoUrl, coverUrl }: {
  gallerySlug: string; galleryName: string; eventDate: string; location: string; intro?: string;
  albums: Album[]; assetsByAlbum: Record<string, Asset[]>; contributors: { id: string; name: string; count: number }[];
  brand: { primary: string; accent: string; logo?: string };
  siteName: string; siteLogoUrl: string | null; coverUrl?: string | null;
}) {
  const single = albums.length === 1;
  const [openAlbum, setOpenAlbum] = useState<string | null>(single ? albums[0]?.id : null);
  const [filter, setFilter] = useState<string | null>(null);
  const [lb, setLb] = useState<{ album: string; i: number } | null>(null);
  const style = { ["--brand" as any]: brand.primary, ["--accent" as any]: brand.accent } as React.CSSProperties;

  // Cart — pick individual photos across albums, download just those later.
  // Lives in localStorage, scoped to this gallery, so it survives a refresh.
  // Download-only: no payment, no server-side cart state (see db/004_orders_stub.sql
  // for where a future paid flow would attach — unused today).
  const CART_MAX = 200;
  const cartKey = `cart:${gallerySlug}`;
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const [cartMsg, setCartMsg] = useState("");
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
      if (next.size >= CART_MAX) { setCartMsg(`You can add up to ${CART_MAX} photos to your cart at once — download this batch first.`); setTimeout(() => setCartMsg(""), 5000); return; }
      next.add(id);
    }
    persistCart(next);
  };
  const clearCart = () => persistCart(new Set());
  const cartDownloadUrl = `/g/${gallerySlug}/download?${[...cart].map((id) => `id=${id}`).join("&")}`;

  // Bib-number search — proves the tagging retrieval path end to end.
  const [bibQuery, setBibQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Asset[] | null>(null);
  const [searching, setSearching] = useState(false);
  const runSearch = async () => {
    if (!bibQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/gallery/${gallerySlug}/search?bib=${encodeURIComponent(bibQuery.trim())}`);
      const d = await r.json();
      setSearchResults(r.ok ? d.assets : []);
    } finally { setSearching(false); }
  };
  const clearSearch = () => { setBibQuery(""); setSearchResults(null); };

  // Cart items can come from any album (or a search), so resolve against
  // everything currently loaded, not just the open album.
  const allAssetsById = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const list of Object.values(assetsByAlbum)) for (const a of list) m.set(a.id, a);
    if (searchResults) for (const a of searchResults) m.set(a.id, a);
    return m;
  }, [assetsByAlbum, searchResults]);
  const cartItems = [...cart].map((id) => allAssetsById.get(id)).filter(Boolean) as Asset[];

  const album = albums.find((a) => a.id === openAlbum) || null;
  const assets = openAlbum ? assetsByAlbum[openAlbum] || [] : [];
  const shown = useMemo(() => (filter ? assets.filter((a) => a.contributor_id === filter) : assets), [assets, filter]);
  const lbList = lb ? (lb.album === "__search__" ? searchResults || [] : assetsByAlbum[lb.album] || []) : [];
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
      <SiteHeader siteName={siteName} logoUrl={siteLogoUrl} crumbs={crumbs} />
      {!album && (
        <header className="relative overflow-hidden border-b border-[var(--border)]">
          {coverUrl && <>
            <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
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
                {!single && <button onClick={() => { setOpenAlbum(null); setFilter(null); }} className="eyebrow mb-1 flex items-center gap-1.5 transition hover:text-[var(--text)]"><ArrowLeft size={12} /> All albums</button>}
                <h1 className="display truncate text-3xl sm:text-4xl">{album.name}</h1>
                <p className="data mt-0.5 text-[var(--text-2)]">{album.count} photos</p>
              </div>
              <a href={`/g/${gallerySlug}/download?album=${album.slug}`} className="btn-primary flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm"><Download size={16} /> <span className="hidden sm:inline">Download album</span></a>
            </div>
            {contributors.length > 1 && (
              <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
                <Chip active={!filter} onClick={() => setFilter(null)} label="Everyone" count={album.count} />
                {contributors.map((c) => <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)} label={c.name} count={c.count} />)}
              </div>
            )}
          </div>
        </header>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">
        {!album && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">{searchResults !== null ? "Search" : "Albums"}</div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5">
                  <Search size={14} className="text-[var(--text-3)]" />
                  <input value={bibQuery} onChange={(e) => setBibQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="Find your bib number" className="w-36 bg-transparent py-2 text-sm outline-none sm:w-44" />
                  {searchResults !== null && <button onClick={clearSearch} className="text-[var(--text-3)] transition hover:text-[var(--text)]"><X size={13} /></button>}
                </div>
                {searchResults === null && <a href={`/g/${gallerySlug}/download`} className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm"><Download size={15} /> <span className="hidden sm:inline">Download everything</span></a>}
              </div>
            </div>

            {searchResults !== null ? (
              <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
                {searchResults.map((a) => (
                  <figure key={a.id} className={`group relative break-inside-avoid overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] ${cart.has(a.id) ? "ring-2 ring-[var(--brand)]" : ""}`}>
                    <img src={a.thumb} alt="" loading="lazy" width={a.width} height={a.height} onClick={() => setLb({ album: "__search__", i: searchResults.indexOf(a) })} className="w-full cursor-zoom-in transition duration-300 group-hover:opacity-95" />
                    {a.kind === "video" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="rounded-full bg-black/50 p-3 backdrop-blur"><Play size={18} fill="white" /></div></div>}
                    <button onClick={(e) => { e.stopPropagation(); toggleCart(a.id); }} title={cart.has(a.id) ? "Remove from cart" : "Add to cart"}
                      className={`absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition focus:opacity-100 ${cart.has(a.id) ? "bg-[var(--brand)] text-white opacity-100" : "bg-black/40 text-white/90 opacity-0 group-hover:opacity-100"}`}>
                      {cart.has(a.id) ? <Check size={15} /> : <ShoppingCart size={15} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); dl(a.download_url, a.download_filename); }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100" title="Download"><Download size={15} /></button>
                    <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 opacity-0 transition group-hover:opacity-100"><span className="data text-white/90"><span className="text-[var(--text-2)]">SHOT BY</span> {a.firstName}</span></figcaption>
                  </figure>
                ))}
                {!searching && !searchResults.length && <p className="data col-span-full py-24 text-center text-[var(--text-2)]">No photos found for bib "{bibQuery}".</p>}
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((al) => (
                <button key={al.id} onClick={() => setOpenAlbum(al.id)} className="group text-left">
                  <div className="relative aspect-[3/2] overflow-hidden rounded-[var(--radius)] bg-[var(--surface)]">
                    {al.cover ? <img src={al.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : <div className="data grid h-full place-items-center text-[var(--text-3)]">no photos yet</div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                      <h2 className="display text-2xl text-white drop-shadow">{al.name}</h2>
                      <span className="data rounded bg-black/40 px-2 py-0.5 text-white/90 backdrop-blur">{al.count}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            )}
          </>
        )}

        {album && (
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
            {shown.map((a) => (
              <figure key={a.id} className={`group relative break-inside-avoid overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] ${cart.has(a.id) ? "ring-2 ring-[var(--brand)]" : ""}`}>
                <img src={a.thumb} alt="" loading="lazy" width={a.width} height={a.height} onClick={() => setLb({ album: album.id, i: assets.indexOf(a) })} className="w-full cursor-zoom-in transition duration-300 group-hover:opacity-95" />
                {a.kind === "video" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="rounded-full bg-black/50 p-3 backdrop-blur"><Play size={18} fill="white" /></div></div>}
                <button onClick={(e) => { e.stopPropagation(); toggleCart(a.id); }} title={cart.has(a.id) ? "Remove from cart" : "Add to cart"}
                  className={`absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition focus:opacity-100 ${cart.has(a.id) ? "bg-[var(--brand)] text-white opacity-100" : "bg-black/40 text-white/90 opacity-0 group-hover:opacity-100"}`}>
                  {cart.has(a.id) ? <Check size={15} /> : <ShoppingCart size={15} />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); dl(a.download_url, a.download_filename); }} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100" title="Download"><Download size={15} /></button>
                <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 opacity-0 transition group-hover:opacity-100"><span className="data text-white/90"><span className="text-[var(--text-2)]">SHOT BY</span> {a.firstName}</span></figcaption>
              </figure>
            ))}
            {!shown.length && <p className="data col-span-full py-24 text-center text-[var(--text-2)]">Nothing here yet.</p>}
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
            {current.kind === "video" ? <video src={current.download_url} controls autoPlay className="max-h-[72vh] max-w-full" /> : <img src={current.preview} alt="" draggable={false} className="max-h-[72vh] max-w-full select-none object-contain" />}
            {lb!.i < lbList.length - 1 && <button onClick={() => setLb({ ...lb!, i: lb!.i + 1 })} className="absolute right-2 z-10 rounded-full bg-white/10 p-2 transition hover:bg-white/20"><ChevronRight size={24} /></button>}
          </div>
          <div className="border-t border-white/15 px-5 py-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="data"><span className="text-white/60">SHOT BY</span> {current.firstName}</span>
                <span className="data text-white/60">{current.width} × {current.height}</span>
              </div>
              <p className="data text-white/45">You're viewing a preview — download the full-size file below, it's free.</p>
              <div className="flex gap-3">
                <button onClick={() => toggleCart(current.id)} className={`flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-4 text-base transition ${cart.has(current.id) ? "bg-[var(--brand)] text-white" : "border border-white/20 text-white/90 hover:bg-white/10"}`} title={cart.has(current.id) ? "Remove from cart" : "Add to cart"}>
                  {cart.has(current.id) ? <Check size={18} /> : <ShoppingCart size={18} />}
                </button>
                <button onClick={() => dl(current.download_url, current.download_filename)} className="btn-primary flex flex-1 items-center justify-center gap-2 px-5 py-4 text-base"><Download size={18} /> Download full resolution — free</button>
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

      {cartMsg && (
        <div className="fixed bottom-20 right-4 z-40 max-w-xs rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-2xl">{cartMsg}</div>
      )}

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
                <a href={cartDownloadUrl} className="btn-primary flex w-full items-center justify-center gap-2 py-3"><Download size={16} /> Download all ({cart.size})</a>
                <button onClick={clearCart} className="btn-ghost flex w-full items-center justify-center gap-2 py-2.5 text-sm"><Trash2 size={14} /> Clear cart</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function Chip({ active, onClick, label, count }: any) {
  return <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-transparent bg-[var(--brand)] text-white" : "border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]"}`}>{label}<span className="ml-1.5 opacity-70">{count}</span></button>;
}
