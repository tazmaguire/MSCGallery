"use client";
import { useState, useEffect, useMemo } from "react"; import Link from "next/link";
import { Plus, Eye, EyeOff, Database, CheckSquare, Square, X, EyeOff as Unlist, Eye as List, Tag, GripVertical } from "lucide-react";
import { formatBytes, billedMonthlyCost, formatUSD } from "@/lib/storageCost";

type SortKey = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "custom";
const SORT_LABELS: Record<SortKey, string> = {
  date_desc: "Date (newest first)", date_asc: "Date (oldest first)",
  name_asc: "Name (A–Z)", name_desc: "Name (Z–A)", custom: "Custom order (drag to reorder)",
};

export default function GalleryList({ isOwner }: { isOwner: boolean }) {
  const [g, setG] = useState<any[]>([]); const [show, setShow] = useState(false);
  // "date_asc" (oldest to newest) is the site-wide default until the setting
  // loads — matches siteConfig()'s default so there's no visible flash of a
  // different order. This choice is a real, persisted setting
  // (site_settings.gallery_sort_mode, db/012_gallery_sort_mode.sql) shown to
  // every visitor on the public home page — not just this admin's local view,
  // which is what it used to be. Guests never get a control to change it.
  const [sort, setSort] = useState<SortKey>("date_asc");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<any[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const load = () => fetch("/api/admin/galleries").then(r => r.json()).then(d => setG(d.galleries));
  useEffect(() => {
    load();
    fetch("/api/admin/categories").then(r => r.json()).then(d => setCategories(d.categories || []));
    fetch("/api/admin/settings").then(r => r.json()).then(d => {
      const mode = d.settings?.gallery_sort_mode;
      if (mode) setSort(mode);
    });
  }, []);
  const changeSort = (mode: SortKey) => {
    setSort(mode);
    fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ gallery_sort_mode: mode }) });
  };
  const toggle = (x: any) => fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: x.id, is_published: !x.is_published }) }).then(load);
  const totalBytes = useMemo(() => g.reduce((n, x) => n + Number(x.storage_bytes || 0), 0), [g]);

  const sorted = useMemo(() => {
    const withDate = g.filter(x => x.event_date); const noDate = g.filter(x => !x.event_date);
    const cmp: Record<Exclude<SortKey, "custom">, (a: any, b: any) => number> = {
      date_desc: (a, b) => +new Date(b.event_date) - +new Date(a.event_date),
      date_asc: (a, b) => +new Date(a.event_date) - +new Date(b.event_date),
      name_asc: (a, b) => a.name.localeCompare(b.name),
      name_desc: (a, b) => b.name.localeCompare(a.name),
    };
    if (sort === "custom") return [...g].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (sort === "name_asc" || sort === "name_desc") return [...g].sort(cmp[sort]);
    // Date sorts: undated galleries always sort last, regardless of direction.
    return [...withDate.sort(cmp[sort]), ...noDate.sort((a, b) => a.name.localeCompare(b.name))];
  }, [g, sort]);

  const selectAll = () => setSel(new Set(sorted.map(x => x.id)));
  const deselectAll = () => setSel(new Set());
  const toggleSel = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Drag-to-reorder — only active in "Custom order" mode. Reorders the local
  // list immediately (by rewriting sort_order so the useMemo above reflects
  // it without waiting on a refetch), then persists in the background.
  const reorderTo = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const ids = sorted.map(x => x.id);
    const from = ids.indexOf(draggedId), to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...ids]; next.splice(from, 1); next.splice(to, 0, draggedId);
    const order = new Map(next.map((gid, i) => [gid, i]));
    setG(gs => gs.map(x => ({ ...x, sort_order: order.get(x.id) ?? x.sort_order })));
    await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reorder: next }) });
  };

  const bulkPatch = async (body: any) => {
    setBulkBusy(true);
    try { await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [...sel], ...body }) }); await load(); }
    finally { setBulkBusy(false); }
  };
  const applyBulkCategory = () => { if (bulkCategory) bulkPatch({ category_id: bulkCategory }).then(() => setBulkCategory("")); };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl">Galleries</h1>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={e => changeSort(e.target.value as SortKey)} title="Sets the order guests see on the public site too" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-2.5 py-2 text-sm outline-none">
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
          </select>
          {isOwner && <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2 px-3 py-2 text-sm"><Plus size={15} />New gallery</button>}
        </div>
      </div>

      {g.length > 0 && (
        <div className="card mb-5 flex items-center gap-3 p-4">
          <Database size={18} className="shrink-0 text-[var(--text-3)]" />
          <div className="data flex-1 text-[var(--text-2)]">
            <span className="text-[var(--text)]">{formatBytes(totalBytes)}</span> used across {g.length} {g.length === 1 ? "gallery" : "galleries"}
            <span className="mx-1.5 text-[var(--text-3)]">·</span>
            ~<span className="text-[var(--text)]">{formatUSD(billedMonthlyCost(totalBytes))}</span>/mo on R2
            <span className="ml-1.5 text-[var(--text-3)]">(first 10GB/mo free, then $0.015/GB)</span>
          </div>
        </div>
      )}

      {g.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <button onClick={selectAll} className="data flex items-center gap-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><CheckSquare size={14} />Select all</button>
          <button onClick={deselectAll} className="data flex items-center gap-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><Square size={14} />Deselect all</button>
          {sel.size > 0 && <span className="data text-[var(--text-3)]">{sel.size} selected</span>}
        </div>
      )}

      <div className={`space-y-2 ${sel.size > 0 ? "pb-20" : "pb-4"}`}>
        {sorted.map(x => (
          <div key={x.id}
            onDragOver={e => sort === "custom" && e.preventDefault()}
            onDrop={() => sort === "custom" && dragId && reorderTo(dragId, x.id)}
            className={`card flex items-center gap-3 p-4 ${sel.has(x.id) ? "border-[var(--accent)]" : ""}`}>
            {sort === "custom" && (
              <span draggable onDragStart={() => setDragId(x.id)} onDragEnd={() => setDragId(null)} className="shrink-0 cursor-grab text-[var(--text-3)] hover:text-[var(--text)] active:cursor-grabbing" title="Drag to reorder">
                <GripVertical size={16} />
              </span>
            )}
            <button onClick={() => toggleSel(x.id)} className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)]" title={sel.has(x.id) ? "Deselect" : "Select"}>
              {sel.has(x.id) ? <CheckSquare size={18} className="text-[var(--accent)]" /> : <Square size={18} />}
            </button>
            <Link href={`/admin/g/${x.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: x.brand?.primary || "#E8442A" }} /><span className="display truncate text-xl">{x.name}</span>{x.is_unlisted && <span className="data shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[var(--text-3)]">Unlisted</span>}{x.category_name && <span className="data shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[var(--text-3)]">{x.category_name}</span>}</div>
              <div className="data mt-1 flex gap-3"><span className="text-emerald-400">{x.visible} live</span>{Number(x.pending) > 0 && <span className="text-[var(--accent)]">{x.pending} pending</span>}<span className="text-[var(--text-3)]">{x.short_code}</span><span className="text-[var(--text-3)]">{formatBytes(Number(x.storage_bytes || 0))}</span></div>
            </Link>
            <button onClick={() => toggle(x)} className={`shrink-0 flex items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-xs font-medium ${x.is_published ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-[var(--text-2)]"}`}>{x.is_published ? <><Eye size={13} />Live</> : <><EyeOff size={13} />Hidden</>}</button>
          </div>
        ))}
        {!g.length && <p className="data text-[var(--text-2)]">No galleries yet. Create your first.</p>}
      </div>

      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm"><strong>{sel.size}</strong> selected</span>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => bulkPatch({ is_published: true })} disabled={bulkBusy} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50"><Eye size={13} />Publish</button>
              <button onClick={() => bulkPatch({ is_published: false })} disabled={bulkBusy} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50"><EyeOff size={13} />Hide</button>
              <button onClick={() => bulkPatch({ is_unlisted: true })} disabled={bulkBusy} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50"><Unlist size={13} />Unlist</button>
              <button onClick={() => bulkPatch({ is_unlisted: false })} disabled={bulkBusy} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-50"><List size={13} />List</button>
              <div className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] pl-2">
                <Tag size={13} className="text-[var(--text-3)]" />
                <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)} className="bg-transparent py-1.5 pr-2 text-xs outline-none">
                  <option value="">Set category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={applyBulkCategory} disabled={!bulkCategory || bulkBusy} className="btn-ghost px-2 py-1.5 text-xs disabled:opacity-30">Apply</button>
              </div>
              <button onClick={deselectAll} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs"><X size={13} />Clear</button>
            </div>
          </div>
        </div>
      )}

      {show && <NewGallery onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}
function NewGallery({ onClose, onDone }: any) {
  const [f, setF] = useState({ name: "", slug: "", short_code: "", event_date: "", location: "", primary: "#E8442A", accent: "#D6E04B" });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5" onClick={e => e.stopPropagation()}>
        <h2 className="display mb-4 text-xl">New gallery</h2>
        {[["Name", "name", "Memorial Stair Climb — Southampton"], ["Short code", "short_code", "MSC2026"], ["Location", "location", "Southampton"]].map(([l, k, p]) => (
          <div key={k} className="mb-3"><label className="data mb-1.5 block text-[var(--text-2)]">{l}</label>
            <input value={(f as any)[k]} onChange={e => setF({ ...f, [k]: k === "short_code" ? e.target.value.toUpperCase() : e.target.value, ...(k === "name" ? { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") } : {}) })} placeholder={p as string} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" /></div>
        ))}
        <div className="mb-3"><label className="data mb-1.5 block text-[var(--text-2)]">Date</label><input type="date" value={f.event_date} onChange={e => setF({ ...f, event_date: e.target.value })} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5" /></div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div><label className="data mb-1.5 block text-[var(--text-2)]">Primary</label><input type="color" value={f.primary} onChange={e => setF({ ...f, primary: e.target.value })} className="h-10 w-full rounded-[var(--radius)] bg-[var(--bg-2)]" /></div>
          <div><label className="data mb-1.5 block text-[var(--text-2)]">Accent</label><input type="color" value={f.accent} onChange={e => setF({ ...f, accent: e.target.value })} className="h-10 w-full rounded-[var(--radius)] bg-[var(--bg-2)]" /></div>
        </div>
        <button onClick={() => fetch("/api/admin/galleries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).then(onDone)} disabled={!f.name || !f.short_code} className="btn-primary w-full py-2.5 disabled:opacity-30">Create (hidden until published)</button>
      </div>
    </div>
  );
}
