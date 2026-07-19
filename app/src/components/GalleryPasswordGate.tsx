"use client";
import { useState } from "react";
import { Lock } from "lucide-react";

export default function GalleryPasswordGate({ slug, galleryName, siteName }: { slug: string; galleryName: string; siteName: string }) {
  const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/gallery/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, password }) });
      if (r.ok) { location.reload(); return; }
      setErr((await r.json().catch(() => ({}))).error || "That password isn't right.");
    } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--surface)]"><Lock size={20} className="text-[var(--text-2)]" /></div>
        <div className="eyebrow mb-1">{siteName}</div>
        <h1 className="display mb-2 text-3xl">{galleryName}</h1>
        <p className="data mb-5 text-[var(--text-2)]">This gallery is password protected.</p>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Password"
          className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-3 text-center outline-none focus:border-[var(--text-2)]" />
        {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
        <button onClick={go} disabled={busy || !password} className="btn-primary w-full py-3 disabled:opacity-50">{busy ? "Checking…" : "Unlock"}</button>
      </div>
    </div>
  );
}
