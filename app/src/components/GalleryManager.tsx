"use client";
/** Admin gallery manager: albums, add pro photos, three link modes + QR, move, edit, delete, branding. */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { QrCode, Eye, Upload, Lock, FolderPlus, Move, Loader2, X, Download, Link2, Copy, Check, Camera, Users, KeyRound, Trash2, Palette, Type, Pencil, Star, Tag, Search, CheckSquare, Square } from "lucide-react";
import { DISPLAY_FONTS, BODY_FONTS, MONO_FONTS } from "@/lib/fonts";
import { formatBytes, flatMonthlyCost, formatUSD } from "@/lib/storageCost";

type ProUploadItem = { id: string; name: string; bytes: number; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };
const PRO_PARALLEL_PARTS = 4;

// Duplicated from Uploader.tsx (the guest uploader) rather than shared —
// deliberately not touching that component, which is the security-sensitive
// guest-facing upload path. Same XHR-for-progress approach either way.
function putWithProgress(url: string, body: Blob, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open("PUT", url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status >= 200 && x.status < 300) ? resolve((x.getResponseHeader("ETag") || "").replace(/"/g, "")) : reject(new Error(`Upload failed (${x.status})`));
    x.onerror = () => reject(new Error("Couldn't reach storage. Please try again."));
    x.send(body);
  });
}

export default function GalleryManager({ gallery, isOwner, storageBytes }: { gallery: any; isOwner: boolean; storageBytes?: number }) {
  const [albums, setAlbums] = useState<any[]>([]); const [active, setActive] = useState<string | null>(null);
  const [assets, setAssets] = useState<any[]>([]); const [sel, setSel] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<any[]>([]);
  const [panel, setPanel] = useState<null | "links" | "newAlbum" | "brand" | "qr" | "editCredit" | "access" | "tags" | "renameGallery" | "renameAlbum">(null);
  const [qrToken, setQrToken] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [proQueue, setProQueue] = useState<ProUploadItem[]>([]);
  const [showProQueue, setShowProQueue] = useState(false);
  const [proCreditName, setProCreditName] = useState("");
  const [proCreditLink, setProCreditLink] = useState("");
  const [bibSearch, setBibSearch] = useState("");
  const [bibResults, setBibResults] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const style = { ["--brand" as any]: gallery.brand?.primary || "#E8442A" } as React.CSSProperties;

  const loadAlbums = useCallback(() => fetch(`/api/admin/albums?gallery=${gallery.id}`).then(r => r.json()).then(d => { setAlbums(d.albums); if (!active && d.albums[0]) setActive(d.albums[0].id); }), [gallery.id, active]);
  const loadAssets = useCallback(() => { if (active) fetch(`/api/admin/assets?album=${active}`).then(r => r.json()).then(d => setAssets(d.assets)); }, [active]);
  const loadLinks = useCallback(() => fetch(`/api/admin/links?gallery=${gallery.id}`).then(r => r.json()).then(d => setLinks(d.links)), [gallery.id]);
  useEffect(() => { loadAlbums(); loadLinks(); }, []);
  useEffect(() => { loadAssets(); setSel(new Set()); }, [active]);
  const album = albums.find(a => a.id === active);

  const [assetSort, setAssetSort] = useState<"date_desc" | "date_asc" | "name_asc" | "name_desc">("date_desc");
  const sortedAssets = useMemo(() => {
    const byName = (a: any) => a.first_name || a.contributor || "";
    switch (assetSort) {
      case "date_asc": return [...assets].reverse(); // server already orders newest-first
      case "name_asc": return [...assets].sort((a, b) => byName(a).localeCompare(byName(b)));
      case "name_desc": return [...assets].sort((a, b) => byName(b).localeCompare(byName(a)));
      default: return assets; // date_desc — the server's native order
    }
  }, [assets, assetSort]);
  const selectAllAssets = () => setSel(new Set(sortedAssets.map(a => a.id)));
  const deselectAllAssets = () => setSel(new Set());

  const uploadPro = async (files: FileList) => {
    if (!active) return;
    const fileArr = Array.from(files);
    const items: ProUploadItem[] = fileArr.map((f) => ({ id: crypto.randomUUID(), name: f.name, bytes: f.size, progress: 0, status: "queued" }));
    setProQueue(items); setShowProQueue(true); setUploading(true);
    const patch = (id: string, p: Partial<ProUploadItem>) => setProQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)));

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i]; const id = items[i].id;
      patch(id, { status: "uploading" });
      try {
        const pres = await fetch("/api/admin/ingest", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ albumId: active, contributorName: proCreditName.trim() || undefined, creditLink: proCreditLink.trim() || undefined, filename: file.name, contentType: file.type, bytes: file.size }) });
        const plan = await pres.json();
        if (!pres.ok) throw new Error(plan.error || "Couldn't start upload.");
        if (plan.mode === "single") {
          await putWithProgress(plan.url, file, (p) => patch(id, { progress: p }));
          await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId }) });
        } else {
          // Multipart (files over the single-PUT threshold — routine for video).
          const parts: { ETag: string; PartNumber: number }[] = []; const done = new Array(plan.urls.length).fill(0);
          const uploadPart = async (idx: number) => {
            const chunk = file.slice(idx * plan.partSize, (idx + 1) * plan.partSize);
            const etag = await putWithProgress(plan.urls[idx], chunk, (p) => {
              done[idx] = (p / 100) * chunk.size;
              patch(id, { progress: Math.round((done.reduce((a, b) => a + b, 0) / file.size) * 100) });
            });
            parts.push({ ETag: etag, PartNumber: idx + 1 });
          };
          const remaining = plan.urls.map((_: any, idx: number) => idx);
          await Promise.all(Array.from({ length: PRO_PARALLEL_PARTS }, async () => {
            for (;;) { const idx = remaining.shift(); if (idx === undefined) return; await uploadPart(idx); }
          }));
          parts.sort((a, b) => a.PartNumber - b.PartNumber);
          await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId, uploadId: plan.uploadId, parts }) });
        }
        patch(id, { status: "done", progress: 100 });
      } catch (e: any) {
        patch(id, { status: "error", error: e.message || "Upload failed" });
      }
    }
    setUploading(false); setTimeout(loadAssets, 1500);
  };
  const move = async (albumId: string) => { await fetch("/api/admin/assets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: [...sel], albumId }) }); setSel(new Set()); loadAssets(); };
  const remove = async () => {
    if (!confirm(`Delete ${sel.size} ${sel.size === 1 ? "photo" : "photos"}? This can't be undone.`)) return;
    await fetch("/api/admin/assets", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: [...sel] }) });
    setSel(new Set()); loadAssets();
  };
  const setCover = async (assetId: string, kind: "gallery" | "album") => {
    if (kind === "gallery") await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: gallery.id, cover_asset_id: assetId }) });
    else await fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: active, cover_asset_id: assetId }) });
  };
  const runBibSearch = async () => {
    if (!bibSearch.trim()) { setBibResults(null); return; }
    const r = await fetch(`/api/admin/tags?gallery=${gallery.id}&value=${encodeURIComponent(bibSearch.trim())}`);
    const d = await r.json();
    setBibResults(r.ok ? d.assets : []);
  };
  const clearBibSearch = () => { setBibSearch(""); setBibResults(null); };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6" style={style}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="display text-3xl">{gallery.name}</h1>
            <button onClick={() => setPanel("renameGallery")} className="text-[var(--text-3)] hover:text-[var(--text)]" title="Rename gallery"><Pencil size={15} /></button>
          </div>
          <p className="data text-[var(--text-2)]">
            {gallery.short_code} · /g/{gallery.slug}
            {storageBytes !== undefined && (
              <span className="text-[var(--text-3)]"> · {formatBytes(storageBytes)} (~{formatUSD(flatMonthlyCost(storageBytes))}/mo)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-2.5">
            <Search size={14} className="text-[var(--text-3)]" />
            <input value={bibSearch} onChange={e => setBibSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && runBibSearch()} placeholder="Bib number" className="w-28 bg-transparent py-2 text-sm outline-none" />
            {bibResults !== null && <button onClick={clearBibSearch} className="text-[var(--text-3)] hover:text-[var(--text)]"><X size={13} /></button>}
          </div>
          <button onClick={() => setPanel("links")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Link2 size={15} />Upload links</button>
          <button onClick={() => setPanel("brand")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Palette size={15} />Branding</button>
          <button onClick={() => setPanel("access")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">{gallery.view_password_hash ? <Lock size={15} /> : <KeyRound size={15} />}Access</button>
          <a href={`/g/${gallery.slug}/download`} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm" title="Whole-gallery zip — admin only, public visitors use the cart instead"><Download size={15} />Download all</a>
          <a href={`/g/${gallery.slug}`} target="_blank" className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Eye size={15} />View</a>
        </div>
      </div>

      {bibResults !== null ? (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="data text-[var(--text-2)]">{bibResults.length} {bibResults.length === 1 ? "photo" : "photos"} tagged "{bibSearch}"</p>
            <button onClick={clearBibSearch} className="btn-ghost px-2.5 py-1.5 text-xs">Clear search</button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {bibResults.map(a => (
              <div key={a.id} className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                <img src={a.thumb_key ? `/thumbs/thumb/${a.thumb_key}` : ""} alt="" loading="lazy" className="aspect-square w-full bg-[var(--surface)] object-cover" />
                {a.visibility === "pending" && <span className="data absolute left-1 top-1 rounded bg-[var(--accent)]/80 px-1 font-bold text-[var(--bg)]">PENDING</span>}
                <div className="data truncate px-1 py-0.5 text-[var(--text-3)]">{a.first_name || a.contributor}</div>
              </div>
            ))}
            {!bibResults.length && <p className="data col-span-full py-16 text-center text-[var(--text-2)]">No photos tagged with that bib number.</p>}
          </div>
        </div>
      ) : <>
      <div className="mb-4 flex flex-wrap gap-2">
        {albums.map(al => (
          <button key={al.id} onClick={() => setActive(al.id)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${active === al.id ? "bg-[var(--text)] text-[var(--bg)]" : "border border-[var(--border)] text-[var(--text-2)]"}`}>
            {al.is_private && <Lock size={12} />}{al.is_guest_album && <Users size={12} />}{al.name}<span className="opacity-60">{al.visible}</span>
          </button>
        ))}
        <button onClick={() => setPanel("newAlbum")} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-3)]"><FolderPlus size={14} />Album</button>
      </div>

      {album && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {!album.is_guest_album && <>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50">{uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}Add photos</button>
              <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => e.target.files && uploadPro(e.target.files)} />
              <input value={proCreditName} onChange={e => setProCreditName(e.target.value)} placeholder="Attributed to (default: Official)" className="w-52 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />
              <input value={proCreditLink} onChange={e => setProCreditLink(e.target.value)} placeholder="Their link (optional)" className="w-52 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />
            </>}
            <button onClick={() => setPanel("renameAlbum")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Pencil size={15} />Rename album</button>
            <a href={`/g/${gallery.slug}/download?album=${album.slug}`} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Download size={15} />Download album</a>
            {!album.is_guest_album && <button onClick={() => fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: album.id, is_private: !album.is_private }) }).then(loadAlbums)} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">{album.is_private ? <><Lock size={15} />Private</> : <><Eye size={15} />Public</>}</button>}
          </div>
          {!album.is_guest_album && <p className="data text-[var(--text-3)]">Applies to whatever you add next — change it any time before clicking Add photos again.</p>}
        </div>
      )}

      {album && assets.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <select value={assetSort} onChange={e => setAssetSort(e.target.value as any)} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-2.5 py-1.5 text-xs outline-none">
            <option value="date_desc">Date (newest first)</option>
            <option value="date_asc">Date (oldest first)</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>
          </select>
          <button onClick={selectAllAssets} className="data flex items-center gap-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><CheckSquare size={13} />Select all</button>
          <button onClick={deselectAllAssets} className="data flex items-center gap-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><Square size={13} />Deselect all</button>
        </div>
      )}

      {showProQueue && (
        <div className="fixed bottom-4 left-4 z-40 w-80 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <span className="data text-[var(--text-2)]">
              Uploading {proQueue.filter(x => x.status === "done").length}/{proQueue.length}
            </span>
            <button onClick={() => setShowProQueue(false)} className="p-0.5 text-[var(--text-3)] hover:text-[var(--text)]"><X size={14} /></button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {proQueue.map(item => (
              <div key={item.id} className="border-b border-[var(--border)] px-3 py-2 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="data truncate text-[var(--text-2)]">{item.name}</span>
                  {item.status === "done" && <Check size={13} className="shrink-0 text-emerald-400" />}
                  {item.status === "error" && <span className="data shrink-0 text-[var(--brand)]" title={item.error}>Failed</span>}
                  {(item.status === "uploading" || item.status === "queued") && <span className="data shrink-0 text-[var(--text-3)]">{item.progress}%</span>}
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div className={`h-full transition-all ${item.status === "error" ? "bg-[var(--brand)]" : item.status === "done" ? "bg-emerald-400" : "bg-[var(--accent)]"}`} style={{ width: `${item.status === "queued" ? 0 : item.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {sortedAssets.map(a => { const on = sel.has(a.id); return (
          <button key={a.id} onClick={() => setSel(s => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} className={`relative overflow-hidden rounded-[var(--radius)] border ${on ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
            <img src={a.thumb_key ? `/thumbs/thumb/${a.thumb_key}` : ""} alt="" loading="lazy" className="aspect-square w-full bg-[var(--surface)] object-cover" />
            {a.visibility === "pending" && <span className="data absolute left-1 top-1 rounded bg-[var(--accent)]/80 px-1 font-bold text-[var(--bg)]">PENDING</span>}
            {on && <div className="absolute inset-0 bg-[var(--accent)]/15" />}
            <div className="data truncate px-1 py-0.5 text-[var(--text-3)]">{a.first_name || a.contributor}</div>
          </button>
        ); })}
      </div>
      {active && !assets.length && <p className="data py-16 text-center text-[var(--text-2)]">Empty album.</p>}

      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm"><strong>{sel.size}</strong> selected</span>
            <div className="flex flex-wrap items-center gap-2">
              {sel.size === 1 && assets.find(a => a.id === [...sel][0])?.kind !== "video" && <>
                <button onClick={() => setCover([...sel][0], "album")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs" title="Use as this album's cover"><Star size={12} />Album cover</button>
                <button onClick={() => setCover([...sel][0], "gallery")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs" title="Use as this gallery's cover"><Star size={12} />Gallery cover</button>
              </>}
              <button onClick={() => setPanel("editCredit")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"><Pencil size={12} />Edit credit</button>
              {sel.size === 1 && <button onClick={() => setPanel("tags")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"><Tag size={12} />Tags</button>}
              {!album?.is_video_album && (
                sel.size <= 300
                  ? <a href={`/g/${gallery.slug}/download?${[...sel].map(id => `id=${id}`).join("&")}`} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"><Download size={12} />Download selected</a>
                  : <span className="data text-[var(--text-2)]">Select 300 or fewer to download together</span>
              )}
              {album?.is_video_album ? (
                <span className="data text-[var(--text-2)]">Videos never leave this album — download, then delete once backed up</span>
              ) : [...sel].some(id => assets.find(a => a.id === id)?.kind === "video") ? (
                <span className="data text-[var(--text-2)]">Videos can't be moved — they stay hidden</span>
              ) : <>
                <span className="data text-[var(--text-2)]">Move to</span>
                {albums.filter(al => al.id !== active && !al.is_video_album).map(al => <button key={al.id} onClick={() => move(al.id)} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"><Move size={12} />{al.name}</button>)}
              </>}
              {isOwner && <button onClick={remove} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs text-[var(--brand)]"><Trash2 size={12} />Delete</button>}
            </div>
          </div>
        </div>
      )}
      </>}

      {panel === "links" && <LinksPanel gallery={gallery} albums={albums} links={links} onClose={() => setPanel(null)} reload={loadLinks} showQr={(t) => { setQrToken(t); setPanel("qr"); }} />}
      {panel === "qr" && <QRModal gallery={gallery} token={qrToken} onClose={() => setPanel("links")} />}
      {panel === "newAlbum" && <NewAlbumModal galleryId={gallery.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); loadAlbums(); }} />}
      {panel === "brand" && <BrandModal gallery={gallery} onClose={() => setPanel(null)} />}
      {panel === "access" && <AccessModal gallery={gallery} onClose={() => setPanel(null)} />}
      {panel === "editCredit" && <EditCreditModal
        current={assets.find(a => a.id === [...sel][0])}
        contributorCount={new Set([...sel].map(id => assets.find(a => a.id === id)?.contributor).filter(Boolean)).size}
        onClose={() => setPanel(null)} onDone={() => { setPanel(null); setSel(new Set()); loadAssets(); }} assetIds={[...sel]} />}
      {panel === "tags" && <TagsModal assetId={[...sel][0]} onClose={() => setPanel(null)} />}
      {panel === "renameGallery" && <RenameModal title="Rename gallery" initial={gallery.name} onClose={() => setPanel(null)}
        onSave={async (name) => { await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: gallery.id, name }) }); setPanel(null); location.reload(); }} />}
      {panel === "renameAlbum" && album && <RenameModal title="Rename album" initial={album.name} onClose={() => setPanel(null)}
        onSave={async (name) => { await fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: album.id, name }) }); setPanel(null); loadAlbums(); }} />}
    </div>
  );
}

function LinksPanel({ gallery, albums, links, onClose, reload, showQr }: any) {
  const [mode, setMode] = useState<"open" | "pin" | "photographer">("open");
  const [pin, setPin] = useState(""); const [name, setName] = useState(""); const [albumId, setAlbumId] = useState(""); const [label, setLabel] = useState("");
  const [copied, setCopied] = useState("");
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const create = async () => { await fetch("/api/admin/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ galleryId: gallery.id, mode, pin, contributorName: name, targetAlbumId: albumId || null, label }) }); setPin(""); setName(""); setLabel(""); reload(); };
  const revoke = async (id: string) => {
    if (!confirm("Delete this link? People with the URL will no longer be able to upload. Photos already submitted through it are kept.")) return;
    await fetch("/api/admin/links", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); reload();
  };
  const copy = (t: string) => { navigator.clipboard.writeText(`${site}/u/${t}`); setCopied(t); setTimeout(() => setCopied(""), 1500); };
  const icon = (m: string) => m === "photographer" ? <Camera size={13} className="text-sky-400" /> : m === "pin" ? <KeyRound size={13} className="text-[var(--accent)]" /> : <Users size={13} className="text-emerald-400" />;

  return (
    <Modal title="Upload links" onClose={onClose} wide>
      <div className="mb-4 space-y-1.5">
        {links.map((l: any) => (
          <div key={l.id} className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--bg-2)] px-3 py-2 text-xs">
            {icon(l.mode)}
            <span className="min-w-0 flex-1 truncate">
              {l.mode === "photographer" ? l.contributor_name : l.mode === "pin" ? "PIN link" : "Open link"}
              {l.album_name && <span className="ml-1.5 text-[var(--text-3)]">→ {l.album_name}</span>}
              {l.label && <span className="ml-1.5 text-[var(--text-3)]">· {l.label}</span>}
            </span>
            <button onClick={() => showQr(l.token)} className="text-[var(--text-2)] hover:text-[var(--text)]"><QrCode size={14} /></button>
            <button onClick={() => copy(l.token)} className="text-[var(--text-2)] hover:text-[var(--text)]">{copied === l.token ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button>
            <button onClick={() => revoke(l.id)} className="text-[var(--text-2)] hover:text-[var(--brand)]"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--border)] p-4">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {([["open", "Open", Users, "Anyone. No gate."], ["pin", "PIN", KeyRound, "Public link, PIN to upload."], ["photographer", "Photographer", Camera, "Trusted. No limit. No moderation."]] as const).map(([m, lbl, Ic, desc]) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-[var(--radius)] border p-3 text-left transition ${mode === m ? "border-[var(--text-2)] bg-[var(--surface)]" : "border-[var(--border)] text-[var(--text-2)]"}`}>
              <Ic size={16} className="mb-1.5" /><div className="text-sm font-semibold">{lbl}</div><div className="data mt-0.5 text-[var(--text-3)]">{desc}</div>
            </button>
          ))}
        </div>
        {mode === "pin" && <input value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN (4+ digits) — you give this out" inputMode="numeric" className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />}
        {mode === "photographer" && <>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Photographer name (credited on every photo)" className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />
          <select value={albumId} onChange={e => setAlbumId(e.target.value)} className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none">
            <option value="">Target album (default: Guest Photos)</option>
            {albums.filter((a: any) => !a.is_guest_album).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </>}
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Note (optional, just for you)" className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />
        <button onClick={create} disabled={mode === "pin" && pin.length < 4 || mode === "photographer" && !name.trim()} className="btn-primary w-full py-2.5 text-sm disabled:opacity-30">Create {mode} link</button>
      </div>
    </Modal>
  );
}

function QRModal({ gallery, token, onClose }: any) {
  const site = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Modal title="Upload QR" onClose={onClose}>
      <div className="rounded-[var(--radius)] bg-white p-4"><img src={`/api/admin/galleries/${gallery.id}/qr?token=${token}`} alt="QR" className="w-full" /></div>
      <p className="data mt-3 break-all text-[var(--text-2)]">{site}/u/{token}</p>
      <a href={`/api/admin/galleries/${gallery.id}/qr?token=${token}`} download={`${gallery.slug}-qr.svg`} className="btn-ghost mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm"><Download size={14} />Download SVG for print</a>
    </Modal>
  );
}
function AccessModal({ gallery, onClose }: any) {
  const [protectedNow, setProtectedNow] = useState(!!gallery.view_password_hash);
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [unlisted, setUnlisted] = useState(!!gallery.is_unlisted);
  const [categoryId, setCategoryId] = useState(gallery.category_id || "");
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [categoryErr, setCategoryErr] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const loadCategories = () => fetch("/api/admin/categories").then(r => r.json()).then(d => setCategories(d.categories || []));
  useEffect(() => { loadCategories(); }, []);
  const addCategory = async () => {
    if (!newCategory.trim()) return;
    setAddingCategory(true); setCategoryErr("");
    try {
      const r = await fetch("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newCategory }) });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) { setCategoryErr(c.error || "Couldn't add that category."); return; }
      setNewCategory(""); await loadCategories(); setCategoryId(c.id);
    } catch {
      setCategoryErr("Couldn't reach the server.");
    } finally { setAddingCategory(false); }
  };
  const save = async () => {
    setBusy(true); setErr("");
    try {
      // Unchecked -> clear. Checked + typed a password -> set it. Checked + left
      // blank with a password already set -> omit the field, keep it as-is.
      const body: any = { id: gallery.id, is_unlisted: unlisted, category_id: categoryId };
      if (!protectedNow) body.view_password = "";
      else if (password) body.view_password = password;
      const r = await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't save. Has the db/002_customisation.sql / db/007_config_and_categories.sql migration been applied?"); return; }
      onClose(); location.reload();
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Access" onClose={onClose}>
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={protectedNow} onChange={e => setProtectedNow(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Password protect this gallery</label>
      {protectedNow && <>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={gallery.view_password_hash ? "New password (leave blank to keep current)" : "Password"} className="mb-1.5 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <p className="data mb-4 text-[var(--text-3)]">Visitors need this to view the gallery page, download the zip, or download individual photos.</p>
      </>}

      <label className="mb-1.5 flex items-center gap-2 text-sm"><input type="checkbox" checked={unlisted} onChange={e => setUnlisted(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Unlisted</label>
      <p className="data mb-4 text-[var(--text-3)]">Hidden from the home page listing, but still reachable by anyone with the direct link (or QR code). Independent of the Published toggle, which controls whether the link works at all.</p>

      <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Category</label>
      <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none">
        <option value="">No category</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="mb-1.5 flex gap-2">
        <input value={newCategory} onChange={e => setNewCategory(e.target.value)} onKeyDown={e => e.key === "Enter" && addCategory()} placeholder="New category, e.g. Sport" className="flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />
        <button onClick={addCategory} disabled={!newCategory.trim() || addingCategory} className="btn-ghost px-3 py-2 text-xs disabled:opacity-30">{addingCategory ? "Adding…" : "Add"}</button>
      </div>
      {categoryErr && <p className="data mb-3 text-[var(--brand)]">{categoryErr}</p>}
      {!categoryErr && <p className="data mb-4 text-[var(--text-3)]">New categories are available to every gallery once added.</p>}

      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      <button onClick={save} disabled={busy || (protectedNow && !gallery.view_password_hash && !password)} className="btn-primary w-full py-2.5 disabled:opacity-30">{busy ? "Saving…" : "Save"}</button>
    </Modal>
  );
}
function TagsModal({ assetId, onClose }: any) {
  const [tags, setTags] = useState<any[]>([]); const [value, setValue] = useState(""); const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  const load = () => fetch(`/api/admin/tags?asset=${assetId}`).then(r => r.json()).then(d => { setTags(d.tags || []); setLoading(false); });
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!value.trim()) return;
    setErr("");
    const r = await fetch("/api/admin/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId, tagType: "bib", value }) });
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't add tag."); return; }
    setValue(""); load();
  };
  const remove = async (id: string) => { await fetch("/api/admin/tags", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); load(); };
  return (
    <Modal title="Bib tags" onClose={onClose}>
      <p className="data mb-3 text-[var(--text-3)]">Tag this photo with a race bib number so participants can search for it.</p>
      {loading ? <Loader2 size={18} className="mx-auto my-4 animate-spin text-[var(--text-3)]" /> : (
        <div className="mb-4 space-y-1.5">
          {tags.map(t => (
            <div key={t.id} className="flex items-center justify-between rounded-[var(--radius)] bg-[var(--bg-2)] px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5"><Tag size={13} className="text-[var(--text-3)]" />{t.value}<span className="data text-[var(--text-3)]">{t.tag_type}</span></span>
              <button onClick={() => remove(t.id)} className="text-[var(--text-2)] hover:text-[var(--brand)]"><Trash2 size={14} /></button>
            </div>
          ))}
          {!tags.length && <p className="data text-[var(--text-3)]">No tags yet.</p>}
        </div>
      )}
      <div className="flex gap-2">
        <input value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Bib number" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <button onClick={add} disabled={!value.trim()} className="btn-primary shrink-0 px-4 disabled:opacity-30">Add</button>
      </div>
      {err && <p className="data mt-2 text-[var(--brand)]">{err}</p>}
    </Modal>
  );
}
function EditCreditModal({ current, assetIds, contributorCount, onClose, onDone }: any) {
  const [name, setName] = useState(current?.contributor || "");
  const [link, setLink] = useState(current?.contributor_link || "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/assets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds, creditName: name, creditLink: link }) });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't save."); return; }
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Edit credit" onClose={onClose}>
      <p className="data mb-3 text-[var(--text-3)]">Applies to this contributor everywhere — including their other photos in this gallery.</p>
      {contributorCount > 1 && (
        <p className="data mb-3 rounded-[var(--radius)] bg-[var(--accent)]/15 px-3 py-2 text-[var(--text)]">
          Your selection spans {contributorCount} different contributors — saving will rename all of them to this one name (and link). If that's not what you meant, select photos from just one contributor first.
        </p>
      )}
      <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Name</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
      <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Link <span className="font-normal text-[var(--text-3)]">(optional — their site, Instagram, portfolio)</span></label>
      <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" className="mb-1.5 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
      <p className="data mb-4 text-[var(--text-3)]">Shows as a small link next to "Shot by {name || "…"}" on the public gallery. Leave blank to remove it.</p>
      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      <button onClick={save} disabled={busy || !name.trim()} className="btn-primary w-full py-2.5 disabled:opacity-30">{busy ? "Saving…" : "Save"}</button>
    </Modal>
  );
}
function RenameModal({ title, initial, onClose, onSave }: any) {
  const [name, setName] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await onSave(name.trim()); } finally { setBusy(false); } };
  return (
    <Modal title={title} onClose={onClose}>
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && name.trim() && save()} autoFocus
        className="mb-4 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
      <button onClick={save} disabled={busy || !name.trim()} className="btn-primary w-full py-2.5 disabled:opacity-30">{busy ? "Saving…" : "Save"}</button>
    </Modal>
  );
}
function NewAlbumModal({ galleryId, onClose, onDone }: any) {
  const [name, setName] = useState(""); const [priv, setPriv] = useState(false);
  return (
    <Modal title="New album" onClose={onClose}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Official Photography" className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Private (hidden from public — a holding area)</label>
      <button onClick={() => fetch("/api/admin/albums", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ galleryId, name, isPrivate: priv }) }).then(onDone)} disabled={!name} className="btn-primary w-full py-2.5 disabled:opacity-30">Create album</button>
    </Modal>
  );
}
function BrandModal({ gallery, onClose }: any) {
  const [primary, setPrimary] = useState(gallery.brand?.primary || "#E8442A");
  const [accent, setAccent] = useState(gallery.brand?.accent || "#D6E04B");
  const [intro, setIntro] = useState(gallery.brand?.intro || "");
  const [terms, setTerms] = useState(gallery.upload_terms || "");
  const [fontDisplay, setFontDisplay] = useState(gallery.brand?.fontDisplay || "Saira Condensed");
  const [fontBody, setFontBody] = useState(gallery.brand?.fontBody || "Inter");
  const [fontMono, setFontMono] = useState(gallery.brand?.fontMono || "Space Mono");
  const save = async () => {
    await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: gallery.id, brand: { ...gallery.brand, primary, accent, intro, fontDisplay, fontBody, fontMono }, upload_terms: terms }) });
    onClose(); location.reload();
  };
  const FontPick = ({ label, value, set, options }: any) => (
    <div>
      <label className="data mb-1.5 block text-[var(--text-2)]">{label}</label>
      <select value={options.includes(value) ? value : "__custom"} onChange={e => set(e.target.value === "__custom" ? "" : e.target.value)} className="field mb-1.5 text-sm">
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
        <option value="__custom">Custom…</option>
      </select>
      {!options.includes(value) && <input value={value} onChange={e => set(e.target.value)} placeholder="Any Google Font name" className="field text-sm" />}
    </div>
  );
  return (
    <Modal title="Branding" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="data mb-1.5 block text-[var(--text-2)]">Primary (actions)</label><input type="color" value={primary} onChange={e => setPrimary(e.target.value)} className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)]" /></div>
        <div><label className="data mb-1.5 block text-[var(--text-2)]">Accent (stripe)</label><input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)]" /></div>
      </div>

      <div className="mt-4 mb-1 flex items-center gap-1.5 text-sm font-semibold"><Type size={14} /> Fonts</div>
      <p className="data mb-3 text-[var(--text-3)]">Pick from the list, or choose Custom to name any Google Font.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <FontPick label="Display" value={fontDisplay} set={setFontDisplay} options={DISPLAY_FONTS} />
        <FontPick label="Body" value={fontBody} set={setFontBody} options={BODY_FONTS} />
        <FontPick label="Data / mono" value={fontMono} set={setFontMono} options={MONO_FONTS} />
      </div>

      <label className="data mb-1.5 mt-4 block text-[var(--text-2)]">Intro (shown under the title)</label>
      <textarea value={intro} onChange={e => setIntro(e.target.value)} rows={2} className="field mb-3 text-sm" />
      <label className="data mb-1.5 block text-[var(--text-2)]">Upload terms (the licence guests agree to)</label>
      <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={5} className="field mb-4 text-sm" />
      <button onClick={save} className="btn-primary w-full py-2.5">Save branding</button>
    </Modal>
  );
}
function Modal({ title, children, onClose, wide }: any) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5`} onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="display text-xl">{title}</h2><button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text)]"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}
