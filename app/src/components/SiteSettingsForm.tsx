"use client";
import { useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";

export default function SiteSettingsForm({ initial }: { initial: any }) {
  const [name, setName] = useState(initial?.name || "");
  const [tagline, setTagline] = useState(initial?.tagline || "");
  const [primary, setPrimary] = useState(initial?.primary_color || "#E8442A");
  const [accent, setAccent] = useState(initial?.accent_color || "#C6B400");
  const [theme, setTheme] = useState(initial?.theme || "");
  const [footerText, setFooterText] = useState(initial?.footer_text || "");
  const [contactEmail, setContactEmail] = useState(initial?.contact_email || "");
  const [displayMode, setDisplayMode] = useState(initial?.display_mode || "both");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_key ? `/thumbs/${initial.logo_key}` : "");
  const [faviconUrl, setFaviconUrl] = useState(initial?.favicon_key ? `/thumbs/${initial.favicon_key}` : "");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const upload = async (type: "logo" | "favicon", file: File) => {
    setUploading(type); setErr("");
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("type", type);
      const r = await fetch("/api/admin/settings/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || `Couldn't upload ${type}.`); return; }
      (type === "logo" ? setLogoUrl : setFaviconUrl)(d.url);
    } finally { setUploading(null); }
  };

  const save = async () => {
    setErr(""); setOk(""); setBusy(true);
    try {
      const r = await fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, tagline, primary_color: primary, accent_color: accent, theme: theme || null, footer_text: footerText, contact_email: contactEmail, display_mode: displayMode }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't save changes."); return; }
      setOk("Saved. Refresh to see it everywhere.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="display mb-1 text-3xl">Site settings</h1>
      <p className="data mb-5 text-[var(--text-2)]">Global, whole-install branding — separate from each gallery's own colours/logo (set per-gallery in its Branding panel).</p>

      <div className="card mb-4 space-y-3 p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Site name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Gallery" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
          <p className="data mt-1.5 text-[var(--text-3)]">Shown in the browser tab, admin nav, and login page.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Tagline</label>
          <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Event galleries" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
      </div>

      <div className="card mb-4 space-y-4 p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Logo</label>
          <div className="flex items-center gap-3">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-10 w-auto rounded bg-[var(--bg-2)] p-1" /> : <span className="data text-[var(--text-3)]">None set</span>}
            <button onClick={() => logoRef.current?.click()} disabled={uploading === "logo"} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
              {uploading === "logo" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Upload
            </button>
            <input ref={logoRef} type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" className="hidden" onChange={e => e.target.files?.[0] && upload("logo", e.target.files[0])} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Favicon</label>
          <div className="flex items-center gap-3">
            {faviconUrl ? <img src={faviconUrl} alt="Favicon" className="h-8 w-8 rounded bg-[var(--bg-2)] p-1" /> : <span className="data text-[var(--text-3)]">None set (falls back to logo)</span>}
            <button onClick={() => faviconRef.current?.click()} disabled={uploading === "favicon"} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
              {uploading === "favicon" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}Upload
            </button>
            <input ref={faviconRef} type="file" accept="image/png,image/webp,image/x-icon,image/svg+xml" className="hidden" onChange={e => e.target.files?.[0] && upload("favicon", e.target.files[0])} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Header display</label>
          <select value={displayMode} onChange={e => setDisplayMode(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none">
            <option value="both">Logo + site name</option>
            <option value="logo">Logo only</option>
            <option value="name">Site name only</option>
          </select>
          <p className="data mt-1.5 text-[var(--text-3)]">Controls the admin nav, login page, and public site header. If no logo is uploaded, the name always shows.</p>
        </div>
      </div>

      <div className="card mb-4 space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="data mb-1.5 block text-[var(--text-2)]">Primary colour</label><input type="color" value={primary} onChange={e => setPrimary(e.target.value)} className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)]" /></div>
          <div><label className="data mb-1.5 block text-[var(--text-2)]">Accent colour</label><input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)]" /></div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Default theme</label>
          <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none">
            <option value="">No preference (light)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="data mt-1.5 text-[var(--text-3)]">A visitor's own toggle always overrides this.</p>
        </div>
      </div>

      <div className="card mb-4 space-y-3 p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Footer text <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
          <input value={footerText} onChange={e => setFooterText(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Contact email <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
          <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
      </div>

      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      {ok && <p className="data mb-3 text-emerald-400">{ok}</p>}
      <button onClick={save} disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
    </div>
  );
}
