"use client";
import { useState } from "react";
import { Lock, X } from "lucide-react";

export default function DownloadPinModal({ gallerySlug, onSuccess, onClose }: { gallerySlug: string; onSuccess: () => void; onClose: () => void }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/gallery/download-unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: gallerySlug, pin }) });
      if (r.ok) { onSuccess(); return; }
      setErr((await r.json().catch(() => ({}))).error || "That PIN isn't right.");
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-4" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-[var(--text-3)] hover:text-[var(--text)]"><X size={18} /></button>
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-2)]"><Lock size={20} className="text-[var(--text-2)]" /></div>
        <h2 className="display mb-2 text-2xl">Enter PIN to download</h2>
        <p className="data mb-5 text-[var(--text-2)]">Browsing is open — this gallery's owner just requires a PIN to download.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value)} type="text" inputMode="numeric" onKeyDown={(e) => e.key === "Enter" && go()} placeholder="PIN"
          className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-3 text-center outline-none focus:border-[var(--text-2)]" />
        {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
        <button onClick={go} disabled={busy || !pin} className="btn-primary w-full py-3 disabled:opacity-50">{busy ? "Checking…" : "Unlock downloads"}</button>
      </div>
    </div>
  );
}
