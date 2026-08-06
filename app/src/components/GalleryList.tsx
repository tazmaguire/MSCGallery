"use client";
import { useState, useEffect } from "react"; import Link from "next/link"; import { Plus, Eye, EyeOff } from "lucide-react";
export default function GalleryList({ isOwner }: { isOwner: boolean }) {
  const [g, setG] = useState<any[]>([]); const [show, setShow] = useState(false);
  const load = () => fetch("/api/admin/galleries").then(r => r.json()).then(d => setG(d.galleries));
  useEffect(() => { load(); }, []);
  const toggle = (x: any) => fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: x.id, is_published: !x.is_published }) }).then(load);
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between"><h1 className="display text-3xl">Galleries</h1>
        {isOwner && <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2 px-3 py-2 text-sm"><Plus size={15} />New gallery</button>}</div>
      <div className="space-y-2">
        {g.map(x => (
          <div key={x.id} className="card flex items-center justify-between gap-3 p-4">
            <Link href={`/admin/g/${x.id}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: x.brand?.primary || "#E8442A" }} /><span className="display truncate text-xl">{x.name}</span>{x.is_unlisted && <span className="data rounded-full bg-white/5 px-2 py-0.5 text-[var(--text-3)]">Unlisted</span>}{x.category_name && <span className="data rounded-full bg-white/5 px-2 py-0.5 text-[var(--text-3)]">{x.category_name}</span>}</div>
              <div className="data mt-1 flex gap-3"><span className="text-emerald-400">{x.visible} live</span>{Number(x.pending) > 0 && <span className="text-[var(--accent)]">{x.pending} pending</span>}<span className="text-[var(--text-3)]">{x.short_code}</span></div>
            </Link>
            <button onClick={() => toggle(x)} className={`flex items-center gap-1.5 rounded-[var(--radius)] px-2.5 py-1.5 text-xs font-medium ${x.is_published ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-[var(--text-2)]"}`}>{x.is_published ? <><Eye size={13} />Live</> : <><EyeOff size={13} />Hidden</>}</button>
          </div>
        ))}
        {!g.length && <p className="data text-[var(--text-2)]">No galleries yet. Create your first.</p>}
      </div>
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
