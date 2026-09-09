"use client";
/** Admin gallery manager: albums, add pro photos, three link modes + QR, move, edit, delete, branding. */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { QrCode, Eye, Upload, Lock, FolderPlus, Loader2, X, Download, Link2, Copy, Check, Camera, Users, KeyRound, Trash2, Palette, Type, Pencil, Star, Tag, Search, CheckSquare, Square, Settings as SettingsIcon, Infinity, Video, AlertTriangle } from "lucide-react";
import { DISPLAY_FONTS, BODY_FONTS, MONO_FONTS } from "@/lib/fonts";
import { formatBytes, flatMonthlyCost, formatUSD } from "@/lib/storageCost";
import { parseVideoUrl } from "@/lib/videoEmbed";
import CaptionEditor from "@/components/CaptionEditor";

type ProUploadItem = { id: string; name: string; file: File; bytes: number; progress: number; status: "queued" | "uploading" | "verifying" | "done" | "error"; error?: string };
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
  const [panel, setPanel] = useState<null | "settings" | "newAlbum" | "qr" | "editCredit" | "tags" | "renameGallery" | "renameAlbum">(null);
  const [settingsTab, setSettingsTab] = useState<"access" | "branding" | "links">("access");
  const [qrToken, setQrToken] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [proQueue, setProQueue] = useState<ProUploadItem[]>([]);
  const [showProQueue, setShowProQueue] = useState(false);
  const [proCreditName, setProCreditName] = useState("");
  const [proCreditLink, setProCreditLink] = useState("");
  const [bibSearch, setBibSearch] = useState("");
  const [bibResults, setBibResults] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const style = { ["--brand" as any]: gallery.brand?.primary || "#E8442A" } as React.CSSProperties;

  const loadAlbums = useCallback(() => fetch(`/api/admin/albums?gallery=${gallery.id}`).then(r => r.json()).then(d => { setAlbums(d.albums); if (!active && d.albums[0]) setActive(d.albums[0].id); }), [gallery.id, active]);
  const loadAssets = useCallback(() => {
    if (!active) return;
    if (albums.find(a => a.id === active)?.is_showcase) return; // no per-asset grid for showcase albums
    fetch(`/api/admin/assets?album=${active}`).then(r => r.json()).then(d => setAssets(d.assets));
  }, [active, albums]);
  const loadLinks = useCallback(() => fetch(`/api/admin/links?gallery=${gallery.id}`).then(r => r.json()).then(d => setLinks(d.links)), [gallery.id]);
  const [sortErr, setSortErr] = useState("");
  const setPhotoSortMode = async (albumId: string, mode: string) => {
    setSortErr("");
    const r = await fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: albumId, photo_sort_mode: mode }) });
    if (!r.ok) { setSortErr((await r.json().catch(() => ({}))).error || "Couldn't save that order."); return; }
    loadAlbums();
  };
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

  const patchPro = (id: string, p: Partial<ProUploadItem>) => setProQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const uploadOnePro = async (file: File, id: string) => {
    patchPro(id, { status: "uploading", progress: 0, error: undefined });
    try {
      const pres = await fetch("/api/admin/ingest", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ albumId: active, contributorName: proCreditName.trim() || undefined, creditLink: proCreditLink.trim() || undefined, filename: file.name, contentType: file.type, bytes: file.size }) });
      const plan = await pres.json();
      if (!pres.ok) throw new Error(plan.error || "Couldn't start upload.");
      let completeRes: Response;
      if (plan.mode === "single") {
        await putWithProgress(plan.url, file, (p) => patchPro(id, { progress: p }));
        patchPro(id, { status: "verifying" });
        completeRes = await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId }) });
      } else {
        // Multipart (files over the single-PUT threshold — routine for video).
        const parts: { ETag: string; PartNumber: number }[] = []; const done = new Array(plan.urls.length).fill(0);
        const uploadPart = async (idx: number) => {
          const chunk = file.slice(idx * plan.partSize, (idx + 1) * plan.partSize);
          const etag = await putWithProgress(plan.urls[idx], chunk, (p) => {
            done[idx] = (p / 100) * chunk.size;
            patchPro(id, { progress: Math.round((done.reduce((a, b) => a + b, 0) / file.size) * 100) });
          });
          parts.push({ ETag: etag, PartNumber: idx + 1 });
        };
        const remaining = plan.urls.map((_: any, idx: number) => idx);
        await Promise.all(Array.from({ length: PRO_PARALLEL_PARTS }, async () => {
          for (;;) { const idx = remaining.shift(); if (idx === undefined) return; await uploadPart(idx); }
        }));
        parts.sort((a, b) => a.PartNumber - b.PartNumber);
        patchPro(id, { status: "verifying" });
        completeRes = await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId, uploadId: plan.uploadId, parts }) });
      }
      // Previously ignored entirely — a non-2xx here (the server's own
      // check that the file actually landed in R2 intact, at the expected
      // size) still marked the item "done". "verifying" above makes that
      // check a visible step, not something invisible between 100% and the
      // checkmark.
      if (!completeRes.ok) { const e = await completeRes.json().catch(() => ({})); throw new Error(e.error || "Upload didn't finish — please retry."); }
      patchPro(id, { status: "done", progress: 100 });
    } catch (e: any) {
      patchPro(id, { status: "error", error: e.message || "Upload failed" });
    }
  };

  const uploadPro = async (files: FileList) => {
    if (!active) return;
    const items: ProUploadItem[] = Array.from(files).map((f) => ({ id: crypto.randomUUID(), name: f.name, file: f, bytes: f.size, progress: 0, status: "queued" }));
    setProQueue(items); setShowProQueue(true); setUploading(true);
    for (const item of items) await uploadOnePro(item.file, item.id);
    setUploading(false); setTimeout(loadAssets, 1500);
  };

  const retryPro = async (item: ProUploadItem) => {
    setUploading(true);
    await uploadOnePro(item.file, item.id);
    setUploading(false); setTimeout(loadAssets, 1500);
  };
  const move = async (albumId: string) => { await fetch("/api/admin/assets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: [...sel], albumId }) }); setSel(new Set()); loadAssets(); };
  const remove = async () => {
    if (!confirm(`Delete ${sel.size} ${sel.size === 1 ? "file" : "files"}? This removes them from storage too, and can't be undone.`)) return;
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

  // Live / Unlisted / Hidden as one clear status, changeable from right here
  // instead of only from the galleries list's Live/Hidden toggle (which
  // never showed Unlisted at all) or burying it in the Access panel.
  //   Live:     is_published=true,  is_unlisted=false — on the home page
  //   Unlisted: is_published=true,  is_unlisted=true  — reachable by link/QR only
  //   Hidden:   is_published=false                    — not reachable at all
  const galleryStatus: "live" | "unlisted" | "hidden" = !gallery.is_published ? "hidden" : gallery.is_unlisted ? "unlisted" : "live";
  const setGalleryStatus = async (status: "live" | "unlisted" | "hidden") => {
    const body: any = { id: gallery.id };
    if (status === "hidden") body.is_published = false;
    else { body.is_published = true; body.is_unlisted = status === "unlisted"; }
    await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    location.reload();
  };
  const STATUS_STYLE: Record<string, string> = {
    live: "bg-emerald-500/20 text-emerald-300",
    unlisted: "bg-[var(--accent)]/20 text-[var(--accent)]",
    hidden: "bg-white/5 text-[var(--text-2)]",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6" style={style}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="display text-3xl">{gallery.name}</h1>
            <button onClick={() => setPanel("renameGallery")} className="text-[var(--text-3)] hover:text-[var(--text)]" title="Rename gallery"><Pencil size={15} /></button>
          </div>
          <p className="data mb-2 text-[var(--text-2)]">
            {gallery.short_code} · /g/{gallery.slug}
            {storageBytes !== undefined && (
              <span className="text-[var(--text-3)]"> · {formatBytes(storageBytes)} (~{formatUSD(flatMonthlyCost(storageBytes))}/mo)</span>
            )}
          </p>
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] p-0.5" title="Live: on the home page. Unlisted: reachable by link/QR only. Hidden: not reachable at all.">
            {(["live", "unlisted", "hidden"] as const).map(s => (
              <button key={s} onClick={() => setGalleryStatus(s)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition ${galleryStatus === s ? STATUS_STYLE[s] : "text-[var(--text-3)] hover:text-[var(--text)]"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-2.5">
            <Search size={14} className="text-[var(--text-3)]" />
            <input value={bibSearch} onChange={e => setBibSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && runBibSearch()} placeholder="Bib number" className="w-28 bg-transparent py-2 text-sm outline-none" />
            {bibResults !== null && <button onClick={clearBibSearch} className="text-[var(--text-3)] hover:text-[var(--text)]"><X size={13} /></button>}
          </div>
          <button onClick={() => { setPanel("settings"); setSettingsTab("access"); }} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><SettingsIcon size={15} />Settings</button>
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
            {al.is_showcase ? <Video size={12} /> : <>{al.is_private && <Lock size={12} />}{al.is_guest_album && <Users size={12} />}</>}
            {al.name}
            {!al.is_showcase && <span className="opacity-60">{al.visible}</span>}
          </button>
        ))}
        <button onClick={() => setPanel("newAlbum")} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-3)]"><FolderPlus size={14} />Album</button>
      </div>

      {album?.is_showcase ? (
        <ShowcaseAlbumPanel album={album} onReload={loadAlbums} onRename={() => setPanel("renameAlbum")} />
      ) : (
      <>
      {album && (
        <div className="mb-4 space-y-2">
          {/* Stacks to a clean vertical list below sm: — as a single flex-wrap
              row this is 6-9 controls (photo/video inputs, two text fields,
              rename, download, public/private, sort) wrapping unpredictably
              on a phone-width screen. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {!album.is_guest_album && <>
              {/* Split by accept type, not just one combined image/video input —
                  iOS Safari silently degrades a mixed accept="image/*,video/*"
                  + multiple input to single-select in the native Photos
                  picker. Same fix as Uploader.tsx (the guest uploader). */}
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50">{uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}Add photos</button>
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && uploadPro(e.target.files)} />
                <button onClick={() => videoFileRef.current?.click()} disabled={uploading} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"><Video size={15} />Add video</button>
                <input ref={videoFileRef} type="file" multiple accept="video/*" className="hidden" onChange={e => e.target.files && uploadPro(e.target.files)} />
              </div>
              <input value={proCreditName} onChange={e => setProCreditName(e.target.value)} placeholder="Attributed to (default: Official)" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)] sm:w-52" />
              <input value={proCreditLink} onChange={e => setProCreditLink(e.target.value)} placeholder="Their link (optional)" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)] sm:w-52" />
            </>}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setPanel("renameAlbum")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Pencil size={15} />Rename album</button>
              <a href={`/g/${gallery.slug}/download?album=${album.slug}`} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Download size={15} />Download album</a>
              {album.is_video_album ? (
                <span className="data flex items-center gap-1.5 text-[var(--text-3)]" title="Videos are never shown on the public site"><Lock size={13} />Always private</span>
              ) : !album.is_guest_album && (
                <button onClick={() => fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: album.id, is_private: !album.is_private }) }).then(loadAlbums)} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">{album.is_private ? <><Lock size={15} />Private</> : <><Eye size={15} />Public</>}</button>
              )}
            </div>
            {/* db/017 + db/018_album_photo_sort_by_source.sql — the order
                PUBLIC VISITORS see this album's photos in, not just this
                admin's local view (that's the separate assetSort dropdown
                further down, below the asset grid). Saves immediately on
                change, same convention as the Public/Private button right
                next to it — and checks the response, unlike the first cut
                of this control, which silently reverted on any save
                failure (most likely an unapplied migration) with zero
                feedback. */}
            <select value={album.photo_sort_mode || "upload_asc"}
              onChange={e => setPhotoSortMode(album.id, e.target.value)}
              title="The order visitors see this album's photos in on the public site"
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none sm:w-auto">
              <option value="upload_asc">Public order: Upload time (oldest first)</option>
              <option value="upload_desc">Public order: Upload time (newest first)</option>
              <option value="metadata_asc">Public order: Date taken (oldest first)</option>
              <option value="metadata_desc">Public order: Date taken (newest first)</option>
              <option value="name_asc">Public order: Name (A–Z)</option>
              <option value="name_desc">Public order: Name (Z–A)</option>
            </select>
          </div>
          {sortErr && <p className="data text-[var(--brand)]">{sortErr}</p>}
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
        <div className="fixed inset-x-4 bottom-4 z-40 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:inset-x-auto sm:left-4 sm:w-80">
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
                  {item.status === "error" && <button onClick={() => retryPro(item)} className="data shrink-0 text-[var(--brand)] underline decoration-dotted" title={item.error}>Failed — Retry</button>}
                  {item.status === "verifying" && <span className="data shrink-0 text-[var(--text-3)]">Verifying…</span>}
                  {(item.status === "uploading" || item.status === "queued") && <span className="data shrink-0 text-[var(--text-3)]">{item.progress}%</span>}
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg-2)]">
                  <div className={`h-full transition-all ${item.status === "error" ? "bg-[var(--brand)]" : item.status === "done" ? "bg-emerald-400" : "bg-[var(--accent)]"}`} style={{ width: `${item.status === "queued" ? 0 : item.status === "verifying" ? 100 : item.progress}%` }} />
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
                <button onClick={() => setCover([...sel][0], "album")} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs" title="Use as this album's cover"><Star size={16} />Album cover</button>
                <button onClick={() => setCover([...sel][0], "gallery")} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs" title="Use as this gallery's cover"><Star size={16} />Gallery cover</button>
              </>}
              <button onClick={() => setPanel("editCredit")} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"><Pencil size={16} />Edit credit</button>
              {sel.size === 1 && <button onClick={() => setPanel("tags")} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"><Tag size={16} />Tags</button>}
              {sel.size <= 300
                ? <a href={`/g/${gallery.slug}/download?${[...sel].map(id => `id=${id}`).join("&")}`} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"><Download size={16} />Download selected</a>
                : <span className="data text-[var(--text-2)]">Select 300 or fewer to download together</span>}
              {album?.is_video_album ? (
                <span className="data text-[var(--text-2)]">Videos never leave this album — download, then delete once backed up</span>
              ) : [...sel].some(id => assets.find(a => a.id === id)?.kind === "video") ? (
                <span className="data text-[var(--text-2)]">Videos can't be moved — they stay hidden</span>
              ) : (
                // One <select> instead of a button per album — the old
                // per-album-button layout was the worst offender for
                // becoming a wall of tiny unreadable buttons on a phone.
                <select value="" onChange={e => e.target.value && move(e.target.value)}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-xs outline-none">
                  <option value="">Move to…</option>
                  {albums.filter(al => al.id !== active && !al.is_video_album).map(al => <option key={al.id} value={al.id}>{al.name}</option>)}
                </select>
              )}
              {isOwner && <button onClick={remove} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs text-[var(--brand)]"><Trash2 size={16} />Delete</button>}
            </div>
          </div>
        </div>
      )}
      </>
      )}
      </>}

      {panel === "settings" && <SettingsModal gallery={gallery} albums={albums} links={links} reloadLinks={loadLinks} isOwner={isOwner}
        initialTab={settingsTab} onClose={() => setPanel(null)} onShowQr={(t) => { setQrToken(t); setPanel("qr"); }} />}
      {panel === "qr" && <QRModal gallery={gallery} token={qrToken} onClose={() => setPanel("settings")} />}
      {panel === "newAlbum" && <NewAlbumModal galleryId={gallery.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); loadAlbums(); }} />}
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

// Consolidates what used to be three separate top-level buttons/modals
// (Upload links, Branding, Access) into one "Settings" entry point with an
// internal tab strip — same segmented-pill pattern used elsewhere in this
// file (e.g. the download-protection toggle inside AccessSettings). Each
// tab's content is the same component/logic as before, just no longer
// wrapped in its own <Modal> — this one supplies the single shared chrome.
function SettingsModal({ gallery, albums, links, reloadLinks, isOwner, initialTab, onClose, onShowQr }: any) {
  const [tab, setTab] = useState<"access" | "branding" | "links" | "downloads" | "uploads">(initialTab || "access");
  const TABS: { key: "access" | "branding" | "links" | "downloads" | "uploads"; label: string; icon: any }[] = [
    { key: "access", label: "Access", icon: Lock },
    { key: "branding", label: "Branding", icon: Palette },
    { key: "links", label: "Upload links", icon: Link2 },
    { key: "downloads", label: "Downloads", icon: Download },
    { key: "uploads", label: "Upload issues", icon: AlertTriangle },
  ];
  return (
    <Modal title="Settings" onClose={onClose} wide>
      {/* Icon-only below sm: with an overflow-x-auto safety net — 5 labeled
          tabs (Access/Branding/Upload links/Downloads/Upload issues) is too
          wide for a narrow modal, especially the full-screen mobile sheet. */}
      <div className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--border)] p-0.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${tab === t.key ? "bg-[var(--brand)]/20 text-[var(--brand)]" : "text-[var(--text-3)] hover:text-[var(--text)]"}`}>
            <t.icon size={13} /><span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      {tab === "access" && <AccessSettings gallery={gallery} />}
      {tab === "branding" && <BrandSettings gallery={gallery} />}
      {tab === "links" && <LinksSettings gallery={gallery} albums={albums} links={links} reload={reloadLinks} showQr={onShowQr} />}
      {tab === "downloads" && <DownloadLogsTab galleryId={gallery.id} />}
      {tab === "uploads" && <UploadIssuesTab galleryId={gallery.id} isOwner={isOwner} />}
    </Modal>
  );
}
// A guest resubmitting the same batch (e.g. their tab reloaded mid-upload
// and, seeing no confirmation, they just tried again) produces a second
// asset the DB's checksum uniqueness rejects — worker/src/index.js labels
// this distinctly ("Duplicate — ...") from a genuine failure, since it
// needs no follow-up at all (the photo is already in the gallery under the
// other upload). Matched by prefix rather than a new column/status value —
// the worker fully controls this string, no schema change needed. Also
// matches the raw Postgres text ("duplicate key value violates unique
// constraint ...assets_gallery_id_checksum_idx") so rows that failed
// before this classification existed still land in the right section
// instead of needing every existing gallery's backlog hand-sorted.
const isDuplicateIssue = (i: any) => i.error?.startsWith("Duplicate") || i.error?.includes("assets_gallery_id_checksum_idx");

function UploadIssuesTab({ galleryId, isOwner }: any) {
  const [issues, setIssues] = useState<any[] | null>(null);
  const load = useCallback(() => fetch(`/api/admin/galleries/${galleryId}/upload-issues`).then(r => r.json()).then(d => setIssues(d.issues || [])), [galleryId]);
  useEffect(() => { load(); }, [load]);
  const dismiss = (ids: string[]) => {
    setIssues(is => is && is.filter(i => !ids.includes(i.id))); // optimistic — these are dead rows either way
    fetch("/api/admin/assets", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: ids }) });
  };
  if (issues === null) return <Loader2 size={18} className="mx-auto my-4 animate-spin text-[var(--text-3)]" />;
  if (!issues.length) return <p className="data py-8 text-center text-[var(--text-3)]">No upload problems — everything that's come in has processed cleanly.</p>;
  const real = issues.filter(i => !isDuplicateIssue(i));
  const dups = issues.filter(isDuplicateIssue);
  const row = (i: any, dim: boolean) => (
    <div key={i.id} className="flex items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-2)] px-3 py-2 text-sm">
      {dim ? <Copy size={15} className="shrink-0 text-[var(--text-3)]" /> : <AlertTriangle size={15} className="shrink-0 text-[var(--brand)]" />}
      <div className="min-w-0 flex-1">
        <div className={`truncate ${dim ? "text-[var(--text-2)]" : ""}`}>{i.original_filename || "(untitled)"}{i.album_name && <span className="text-[var(--text-3)]"> · {i.album_name}</span>}</div>
        <div className="data text-[var(--text-3)]">
          {i.first_name || i.contributor_name || "Unknown"} · {i.status === "awaiting_upload" ? "never arrived" : "failed"} · {new Date(i.created_at).toLocaleString()}
          {i.error && ` · ${i.error}`}
        </div>
      </div>
      {isOwner && <button onClick={() => dismiss([i.id])} className="btn-ghost shrink-0 px-2 py-1.5 text-xs">Dismiss</button>}
    </div>
  );
  return (
    <div className="max-h-96 space-y-4 overflow-y-auto">
      {real.length > 0 && (
        <div className="space-y-1.5">
          <p className="data text-[var(--text-3)]">Never finished uploading, or rejected as an invalid file. A guest whose upload is stuck here typically never saw an error at the time — worth a follow-up with them.</p>
          {real.map(i => row(i, false))}
        </div>
      )}
      {dups.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="data text-[var(--text-3)]">Duplicates — the guest's photo already exists in the gallery under a separate upload. No action needed.</p>
            {isOwner && dups.length > 1 && <button onClick={() => dismiss(dups.map(d => d.id))} className="btn-ghost shrink-0 px-2 py-1.5 text-xs">Dismiss all {dups.length}</button>}
          </div>
          {dups.map(i => row(i, true))}
        </div>
      )}
    </div>
  );
}
function DownloadLogsTab({ galleryId }: any) {
  const [logs, setLogs] = useState<any[] | null>(null);
  useEffect(() => { fetch(`/api/admin/galleries/${galleryId}/download-logs`).then(r => r.json()).then(d => setLogs(d.logs || [])); }, [galleryId]);
  if (logs === null) return <Loader2 size={18} className="mx-auto my-4 animate-spin text-[var(--text-3)]" />;
  if (!logs.length) return <p className="data py-8 text-center text-[var(--text-3)]">No download activity yet.</p>;
  return (
    <div className="max-h-96 space-y-1.5 overflow-y-auto">
      {logs.map(l => (
        <div key={l.id} className="flex items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-2)] px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate">{l.name}{l.email && <span className="text-[var(--text-3)]"> · {l.email}</span>}</div>
            <div className="data text-[var(--text-3)]">{l.kind === "zip" ? "zip" : "single photo"}{l.original_filename && ` · ${l.original_filename}`} · {new Date(l.created_at).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
function LinksSettings({ gallery, albums, links, reload, showQr }: any) {
  const [mode, setMode] = useState<"open" | "pin" | "photographer">("open");
  const [pin, setPin] = useState(""); const [name, setName] = useState(""); const [albumId, setAlbumId] = useState(""); const [label, setLabel] = useState("");
  const [noLimits, setNoLimits] = useState(false);
  const [copied, setCopied] = useState("");
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const create = async () => { await fetch("/api/admin/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ galleryId: gallery.id, mode, pin, contributorName: name, targetAlbumId: albumId || null, label, noLimits }) }); setPin(""); setName(""); setLabel(""); setNoLimits(false); reload(); };
  const revoke = async (id: string) => {
    if (!confirm("Delete this link? People with the URL will no longer be able to upload. Photos already submitted through it are kept.")) return;
    await fetch("/api/admin/links", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); reload();
  };
  const [toggleErr, setToggleErr] = useState("");
  const toggleNoLimits = async (l: any) => {
    setToggleErr("");
    const r = await fetch("/api/admin/links", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: l.id, noLimits: !l.no_limits }) });
    if (!r.ok) { setToggleErr((await r.json().catch(() => ({}))).error || "Couldn't save that change."); return; }
    reload();
  };
  const copy = (t: string) => { navigator.clipboard.writeText(`${site}/u/${t}`); setCopied(t); setTimeout(() => setCopied(""), 1500); };
  const icon = (m: string) => m === "photographer" ? <Camera size={13} className="text-sky-400" /> : m === "pin" ? <KeyRound size={13} className="text-[var(--accent)]" /> : <Users size={13} className="text-emerald-400" />;

  return (
    <>
      {toggleErr && <p className="data mb-2 text-[var(--brand)]">{toggleErr}</p>}
      <div className="mb-4 space-y-1.5">
        {links.map((l: any) => (
          <div key={l.id} className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--bg-2)] px-3 py-2 text-xs">
            {icon(l.mode)}
            <span className="min-w-0 flex-1 truncate">
              {l.mode === "photographer" ? l.contributor_name : l.mode === "pin" ? "PIN link" : "Open link"}
              {l.album_name && <span className="ml-1.5 text-[var(--text-3)]">→ {l.album_name}</span>}
              {l.label && <span className="ml-1.5 text-[var(--text-3)]">· {l.label}</span>}
            </span>
            <button onClick={() => toggleNoLimits(l)}
              title={l.no_limits ? "No size/file limits are applied — click to turn normal limits back on" : "Normal size/file limits apply — click to remove all limits for this link"}
              className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition ${l.no_limits ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-[var(--text-3)] hover:text-[var(--text-2)]"}`}>
              <Infinity size={11} />{l.no_limits ? "No limits" : "Limited"}
            </button>
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
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Note (optional, just for you)" className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm outline-none focus:border-[var(--text-2)]" />
        <label className="mb-3 flex items-center gap-2 text-sm text-[var(--text-2)]">
          <input type="checkbox" checked={noLimits} onChange={e => setNoLimits(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          <Infinity size={14} />No size/file limits for this link
        </label>
        <button onClick={create} disabled={mode === "pin" && pin.length < 4 || mode === "photographer" && !name.trim()} className="btn-primary w-full py-2.5 text-sm disabled:opacity-30">Create {mode} link</button>
      </div>
    </>
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
function AccessSettings({ gallery }: any) {
  const [protectedNow, setProtectedNow] = useState(!!gallery.view_password_hash);
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [unlisted, setUnlisted] = useState(!!gallery.is_unlisted);
  const [downloadMode, setDownloadMode] = useState<"open" | "pin">(gallery.download_mode === "pin" ? "pin" : "open");
  const [downloadPin, setDownloadPin] = useState("");
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
      const body: any = { id: gallery.id, is_unlisted: unlisted, category_id: categoryId, download_mode: downloadMode };
      if (!protectedNow) body.view_password = "";
      else if (password) body.view_password = password;
      if (downloadMode === "pin" && downloadPin) body.download_pin = downloadPin;
      const r = await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't save. Has the db/002_customisation.sql / db/007_config_and_categories.sql migration been applied?"); return; }
      location.reload();
    } finally { setBusy(false); }
  };
  return (
    <>
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={protectedNow} onChange={e => setProtectedNow(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Password protect this gallery</label>
      {protectedNow && <>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={gallery.view_password_hash ? "New password (leave blank to keep current)" : "Password"} className="mb-1.5 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <p className="data mb-4 text-[var(--text-3)]">Visitors need this to view the gallery page, download the zip, or download individual photos.</p>
      </>}

      <label className="mb-1.5 flex items-center gap-2 text-sm"><input type="checkbox" checked={unlisted} onChange={e => setUnlisted(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Unlisted</label>
      <p className="data mb-4 text-[var(--text-3)]">Hidden from the home page listing, but still reachable by anyone with the direct link (or QR code). Independent of the Published toggle, which controls whether the link works at all.</p>

      <div className="my-4 border-t border-[var(--border)]" />
      <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Download protection</label>
      <p className="data mb-2 text-[var(--text-3)]">Separate from the above — visitors can always browse; this only gates the download action (single photo or zip).</p>
      <div className="mb-1.5 flex w-fit gap-1 rounded-full border border-[var(--border)] p-0.5">
        {(["open", "pin"] as const).map(m => (
          <button key={m} onClick={() => setDownloadMode(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${downloadMode === m ? "bg-[var(--brand)]/20 text-[var(--brand)]" : "text-[var(--text-3)] hover:text-[var(--text)]"}`}>
            {m === "open" ? "Open" : "PIN required"}
          </button>
        ))}
      </div>
      {downloadMode === "pin" && <>
        <input value={downloadPin} onChange={e => setDownloadPin(e.target.value)}
          placeholder={gallery.download_pin_hash ? "New PIN (leave blank to keep current)" : "PIN"}
          className="mb-1.5 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <p className="data mb-4 text-[var(--text-3)]">Visitors need this PIN before downloading any photo or the zip.</p>
      </>}

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
      <button onClick={save} disabled={busy || (protectedNow && !gallery.view_password_hash && !password) || (downloadMode === "pin" && !gallery.download_pin_hash && !downloadPin)} className="btn-primary w-full py-2.5 disabled:opacity-30">{busy ? "Saving…" : "Save"}</button>
    </>
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
  const [type, setType] = useState<"photo" | "showcase">("photo");
  const [name, setName] = useState(""); const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const create = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/admin/albums", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(type === "showcase" ? { galleryId, name, isShowcase: true } : { galleryId, name, isPrivate: priv }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't create album."); return; }
    onDone();
  };
  return (
    <Modal title="New album" onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {([["photo", "Photo album", FolderPlus], ["showcase", "Video showcase", Video]] as const).map(([t, lbl, Ic]) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-[var(--radius)] border p-3 text-left transition ${type === t ? "border-[var(--text-2)] bg-[var(--surface)]" : "border-[var(--border)] text-[var(--text-2)]"}`}>
            <Ic size={16} className="mb-1.5" /><div className="text-sm font-semibold">{lbl}</div>
          </button>
        ))}
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={type === "showcase" ? "Race Highlights" : "Official Photography"} className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
      {type === "photo" ? (
        <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Private (hidden from public — a holding area)</label>
      ) : (
        <p className="data mb-4 text-[var(--text-3)]">Starts hidden — configure the video, then set it Public.</p>
      )}
      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      <button onClick={create} disabled={!name || busy} className="btn-primary w-full py-2.5 disabled:opacity-30">{busy ? "Creating…" : "Create album"}</button>
    </Modal>
  );
}
// Video showcase album (db/016_video_showcase_album.sql) — a from-scratch
// small panel, not a stripped-down version of the photo-album toolbar
// above. Deliberately has no download link and no bulk-select tools: there
// is no per-photo asset grid here at all, just the one embedded video.
function ShowcaseAlbumPanel({ album, onReload, onRename }: any) {
  const [videoUrl, setVideoUrl] = useState(album.showcase?.videoUrl || "");
  const [autoplay, setAutoplay] = useState(!!album.showcase?.autoplay);
  const [captionHtml, setCaptionHtml] = useState(album.showcase?.captionHtml || "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [saved, setSaved] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false); const [thumbErr, setThumbErr] = useState("");

  // Hidden/Unlisted/Public — same tri-state derivation and visual pattern as
  // the whole-gallery status pill above (galleryStatus/setGalleryStatus),
  // now scoped to this one album via is_private + is_unlisted (db/016).
  const albumStatus: "public" | "unlisted" | "hidden" = album.is_private ? "hidden" : album.is_unlisted ? "unlisted" : "public";
  const setAlbumStatus = async (status: "public" | "unlisted" | "hidden") => {
    const body: any = { id: album.id };
    if (status === "hidden") { body.is_private = true; body.is_unlisted = false; }
    else { body.is_private = false; body.is_unlisted = status === "unlisted"; }
    await fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    onReload();
  };
  const STATUS_STYLE: Record<string, string> = {
    public: "bg-emerald-500/20 text-emerald-300",
    unlisted: "bg-[var(--accent)]/20 text-[var(--accent)]",
    hidden: "bg-white/5 text-[var(--text-2)]",
  };

  const videoRefValid = !videoUrl || !!parseVideoUrl(videoUrl);

  const save = async () => {
    setBusy(true); setErr(""); setSaved(false);
    const r = await fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: album.id, showcase: { videoUrl, autoplay, captionHtml } }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't save."); return; }
    setSaved(true); onReload();
  };

  const uploadThumb = async (file: File) => {
    setThumbBusy(true); setThumbErr("");
    const form = new FormData(); form.append("file", file);
    const r = await fetch(`/api/admin/albums/${album.id}/thumbnail`, { method: "POST", body: form });
    setThumbBusy(false);
    if (!r.ok) { setThumbErr((await r.json().catch(() => ({}))).error || "Couldn't upload thumbnail."); return; }
    onReload();
  };

  return (
    <div className="mb-6 max-w-xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onRename} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Pencil size={15} />Rename</button>
        <div className="flex items-center gap-1 rounded-full border border-[var(--border)] p-0.5" title="Public: listed in All albums. Unlisted: reachable by direct link only. Hidden: not reachable at all.">
          {(["public", "unlisted", "hidden"] as const).map(s => (
            <button key={s} onClick={() => setAlbumStatus(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition ${albumStatus === s ? STATUS_STYLE[s] : "text-[var(--text-3)] hover:text-[var(--text)]"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Thumbnail</label>
        <div className="flex items-center gap-3">
          {album.showcase?.thumbKey && <img src={`/thumbs/${album.showcase.thumbKey}`} alt="" className="h-16 w-24 rounded-[var(--radius)] object-cover" />}
          <label className="btn-ghost cursor-pointer px-3 py-2 text-sm">
            {thumbBusy ? "Uploading…" : album.showcase?.thumbKey ? "Replace" : "Upload"}
            <input type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={e => e.target.files?.[0] && uploadThumb(e.target.files[0])} />
          </label>
        </div>
        {thumbErr && <p className="data mt-1.5 text-[var(--brand)]">{thumbErr}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Video URL (YouTube or Vimeo)</label>
        <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…"
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--text-2)]" />
        {!videoRefValid && <p className="data mt-1.5 text-[var(--brand)]">Couldn't recognize that as a YouTube or Vimeo link.</p>}
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--text-2)]"><input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />Autoplay</label>
        <p className="data text-[var(--text-3)]">Browsers only allow autoplay when muted — visitors can unmute once it's playing.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Caption</label>
        <CaptionEditor value={captionHtml} onChange={setCaptionHtml} />
      </div>

      {err && <p className="data text-[var(--brand)]">{err}</p>}
      {saved && !err && <p className="data text-emerald-400">Saved.</p>}
      <button onClick={save} disabled={busy || !videoRefValid} className="btn-primary px-5 py-2.5 text-sm disabled:opacity-30">{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}
function BrandSettings({ gallery }: any) {
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
    location.reload();
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
    <>
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
    </>
  );
}
function Modal({ title, children, onClose, wide }: any) {
  // grid place-items-center + overflow-y-auto clips the top of anything
  // taller than the viewport (a known CSS quirk: the browser only lets you
  // scroll to the centered item's excess on one side) — hit SettingsModal
  // as soon as a tab had more than a couple of rows. flex items-start with
  // manual vertical padding scrolls correctly instead. Full-screen below
  // sm: rather than a small centered card, since a phone has no room to
  // spare around a "centered" dialog anyway.
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 py-8 sm:items-center" onClick={onClose}>
      <div className={`h-full w-full sm:h-auto ${wide ? "sm:max-w-lg" : "sm:max-w-sm"} rounded-none border border-[var(--border)] bg-[var(--surface)] p-5 sm:rounded-[var(--radius)]`} onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="display text-xl">{title}</h2><button onClick={onClose} className="text-[var(--text-2)] hover:text-[var(--text)]"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}
