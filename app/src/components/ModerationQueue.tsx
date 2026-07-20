"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, X, Loader2, Undo2, ShieldCheck } from "lucide-react";

type GalleryTab = { id: string; name: string; n: number };

export default function ModerationQueue({ initial, galleries, activeGallery }: { initial: any[]; galleries: GalleryTab[]; activeGallery: string | null }) {
  const [queue, setQueue] = useState(initial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ ids: string[]; assets: any[]; action: "approve" | "reject" } | null>(null);
  const total = galleries.reduce((s, g) => s + g.n, 0);

  const toggle = useCallback((id: string) => {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const act = useCallback(async (ids: string[], action: "approve" | "reject") => {
    if (!ids.length || busy) return;
    setBusy(true);
    const removed = queue.filter((a) => ids.includes(a.id));
    setQueue((q) => q.filter((a) => !ids.includes(a.id)));
    setSel((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
    setUndo({ ids, assets: removed, action });
    setTimeout(() => setUndo((u) => (u?.ids.join() === ids.join() ? null : u)), 6000);
    try {
      await fetch("/api/admin/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: ids, action }) });
    } catch {
      setQueue((q) => [...removed, ...q]); // put them back if the request itself failed
    } finally { setBusy(false); }
  }, [busy, queue]);

  const approveSelected = () => act([...sel], "approve");
  const approveAll = () => {
    if (!confirm(`Approve all ${queue.length} photo${queue.length === 1 ? "" : "s"} currently listed${activeGallery ? " for this event" : ""}? They'll go public immediately.`)) return;
    act(queue.map((a) => a.id), "approve");
  };
  const rejectOne = (id: string) => act([id], "reject");
  const undoLast = useCallback(async () => {
    if (!undo) return;
    await fetch("/api/admin/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: undo.ids, action: "requeue" }) });
    setQueue((q) => [...undo.assets, ...q]); setUndo(null);
  }, [undo]);

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
    <div className="mx-auto max-w-7xl px-4 py-4">
      {tabs}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-2xl">Moderation</h1>
          <p className="data text-[var(--text-2)]">{queue.length} waiting{sel.size > 0 ? ` · ${sel.size} selected` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={approveAll} disabled={busy} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50"><ShieldCheck size={15} />Approve all ({queue.length})</button>
          <button onClick={approveSelected} disabled={busy || !sel.size} className="flex items-center gap-2 rounded-[var(--radius)] bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Approve selected ({sel.size})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {queue.map((a) => { const on = sel.has(a.id); return (
          <div key={a.id} className={`group relative overflow-hidden rounded-[var(--radius)] border bg-[var(--surface)] ${on ? "border-[var(--brand)] ring-2 ring-[var(--brand)]" : "border-[var(--border)]"}`}>
            <img src={a.preview || a.thumb} alt="" loading="lazy" onClick={() => toggle(a.id)} className="aspect-[4/3] w-full cursor-pointer bg-[var(--bg-2)] object-cover" />
            <button onClick={() => toggle(a.id)} title={on ? "Deselect" : "Select"}
              className={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full backdrop-blur transition ${on ? "bg-[var(--brand)] text-white" : "bg-black/40 text-white/90"}`}>
              {on && <Check size={14} />}
            </button>
            <button onClick={() => rejectOne(a.id)} disabled={busy} title="Reject"
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white/90 backdrop-blur transition hover:bg-[var(--brand)] disabled:opacity-50">
              <X size={14} />
            </button>
            <div className="data absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-white/90">
              {a.gallery_name && <span className="font-bold">{a.gallery_name}</span>}{a.gallery_name && " · "}{a.first_name || a.contributor_name || "Unknown"}
            </div>
          </div>
        ); })}
      </div>

      {undo && <UndoBar undo={undo} onUndo={undoLast} />}
    </div>
  );
}
function UndoBar({ undo, onUndo }: any) {
  const n = undo.ids.length;
  return <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-2xl">
    <span className="text-sm">{n} {n === 1 ? "photo" : "photos"} {undo.action === "approve" ? "approved" : "rejected"}</span>
    <button onClick={onUndo} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]"><Undo2 size={14} />Undo</button>
  </div>;
}
