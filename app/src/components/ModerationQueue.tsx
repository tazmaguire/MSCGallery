"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Check, X, Loader2, Undo2, ChevronLeft, ChevronRight } from "lucide-react";

type GalleryTab = { id: string; name: string; n: number };

export default function ModerationQueue({ initial, galleries, activeGallery }: { initial: any[]; galleries: GalleryTab[]; activeGallery: string | null }) {
  const [queue, setQueue] = useState(initial);
  const [i, setI] = useState(0); const [busy, setBusy] = useState(false); const [undo, setUndo] = useState<any>(null);
  const current = queue[i];
  const total = galleries.reduce((s, g) => s + g.n, 0);
  const act = useCallback(async (action: "approve" | "reject") => {
    if (!current || busy) return; setBusy(true); const asset = current;
    setQueue((q) => q.filter((a) => a.id !== asset.id)); setI((n) => Math.min(n, queue.length - 2));
    setUndo({ asset, action }); setTimeout(() => setUndo((u: any) => u?.asset.id === asset.id ? null : u), 6000);
    try { await fetch("/api/admin/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: [asset.id], action }) }); }
    catch { setQueue((q) => [asset, ...q]); } finally { setBusy(false); }
  }, [current, busy, queue.length]);
  const undoLast = useCallback(async () => { if (!undo) return;
    await fetch("/api/admin/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: [undo.asset.id], action: "requeue" }) });
    setQueue((q) => [undo.asset, ...q]); setUndo(null); }, [undo]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "a") act("approve"); if (e.key.toLowerCase() === "r") act("reject");
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, queue.length - 1)); if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [act, queue.length]);

  const tabs = galleries.length > 1 && (
    <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
      <Link href="/admin/queue" className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${!activeGallery ? "border-transparent bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]"}`}>
        All<span className="ml-1.5 opacity-70">{total}</span>
      </Link>
      {galleries.map((g) => (
        <Link key={g.id} href={`/admin/queue?gallery=${g.id}`} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${activeGallery === g.id ? "border-transparent bg-[var(--text)] text-[var(--bg)]" : "border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]"}`}>
          {g.name}<span className="ml-1.5 opacity-70">{g.n}</span>
        </Link>
      ))}
    </div>
  );

  if (!queue.length) return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-4 text-center">
      {tabs}
      <div><Check size={40} className="mx-auto mb-4 text-emerald-400" /><h2 className="display text-2xl">Queue is clear</h2><p className="data mt-1 text-[var(--text-2)]">Nothing waiting{activeGallery ? " for this event" : ""}.</p></div>
      {undo && <UndoBar undo={undo} onUndo={undoLast} />}
    </div>
  );
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-4">
      {tabs}
      <div className="mb-3 flex items-center justify-between">
        <div><h1 className="display text-2xl">Moderation</h1><p className="data text-[var(--text-2)]">{queue.length} waiting · {i + 1} of {queue.length}</p></div>
        <div className="data hidden text-[var(--text-3)] sm:block"><kbd className="rounded bg-white/10 px-1.5 py-0.5">A</kbd> approve · <kbd className="rounded bg-white/10 px-1.5 py-0.5">R</kbd> reject</div>
      </div>
      <div className="relative flex flex-1 items-center justify-center rounded-[var(--radius)] bg-[var(--surface)]">
        <img src={current.preview || current.thumb} alt="" className="max-h-[55vh] w-full object-contain" />
        {i > 0 && <button onClick={() => setI(i - 1)} className="absolute left-2 rounded-full bg-black/50 p-2 backdrop-blur"><ChevronLeft size={20} /></button>}
        {i < queue.length - 1 && <button onClick={() => setI(i + 1)} className="absolute right-2 rounded-full bg-black/50 p-2 backdrop-blur"><ChevronRight size={20} /></button>}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="data rounded-full bg-[var(--accent)]/20 px-2.5 py-1 font-bold text-[var(--accent)] backdrop-blur">GUEST UPLOAD</span>
          {current.gallery_name && <span className="data rounded-full bg-black/50 px-2.5 py-1 font-bold text-white/90 backdrop-blur">{current.gallery_name}</span>}
        </div>
      </div>
      <div className="data mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-2)]">
        <span className="text-[var(--text)]">SHOT BY {current.first_name || current.contributor_name || "Unknown"}</span>
        {current.album_name && <span>{current.album_name}</span>}
        <span>{current.width} × {current.height}</span><span>{(current.bytes / 1e6).toFixed(1)}MB</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 pb-4">
        <button onClick={() => act("reject")} disabled={busy} className="btn-ghost flex items-center justify-center gap-2 py-4 font-semibold active:scale-95 disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}Reject</button>
        <button onClick={() => act("approve")} disabled={busy} className="flex items-center justify-center gap-2 rounded-[var(--radius)] bg-emerald-600 py-4 font-semibold text-white active:scale-95 disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}Approve</button>
      </div>
      <p className="data pb-4 text-center text-[var(--text-3)]">Rejecting hides the photo — nothing is deleted.</p>
      {undo && <UndoBar undo={undo} onUndo={undoLast} />}
    </div>
  );
}
function UndoBar({ undo, onUndo }: any) {
  return <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-2xl">
    <span className="text-sm">{undo.action === "approve" ? "Approved" : "Rejected"}</span>
    <button onClick={onUndo} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]"><Undo2 size={14} />Undo</button>
  </div>;
}
