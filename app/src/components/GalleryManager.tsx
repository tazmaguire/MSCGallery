"use client";
/** Admin gallery manager: albums, add pro photos, three link modes + QR, move, edit, delete, branding. */
import { useState, useEffect, useCallback, useRef } from "react";
import { QrCode, Eye, Upload, Lock, FolderPlus, Move, Loader2, X, Download, Link2, Copy, Check, Camera, Users, KeyRound, Trash2, Palette, Type, Pencil, Star } from "lucide-react";
import { DISPLAY_FONTS, BODY_FONTS, MONO_FONTS } from "@/lib/fonts";

export default function GalleryManager({ gallery, isOwner }: { gallery: any; isOwner: boolean }) {
  const [albums, setAlbums] = useState<any[]>([]); const [active, setActive] = useState<string | null>(null);
  const [assets, setAssets] = useState<any[]>([]); const [sel, setSel] = useState<Set<string>>(new Set());
  const [links, setLinks] = useState<any[]>([]);
  const [panel, setPanel] = useState<null | "links" | "newAlbum" | "brand" | "qr" | "editCredit" | "access">(null);
  const [qrToken, setQrToken] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const style = { ["--brand" as any]: gallery.brand?.primary || "#E8442A" } as React.CSSProperties;

  const loadAlbums = useCallback(() => fetch(`/api/admin/albums?gallery=${gallery.id}`).then(r => r.json()).then(d => { setAlbums(d.albums); if (!active && d.albums[0]) setActive(d.albums[0].id); }), [gallery.id, active]);
  const loadAssets = useCallback(() => { if (active) fetch(`/api/admin/assets?album=${active}`).then(r => r.json()).then(d => setAssets(d.assets)); }, [active]);
  const loadLinks = useCallback(() => fetch(`/api/admin/links?gallery=${gallery.id}`).then(r => r.json()).then(d => setLinks(d.links)), [gallery.id]);
  useEffect(() => { loadAlbums(); loadLinks(); }, []);
  useEffect(() => { loadAssets(); setSel(new Set()); }, [active]);
  const album = albums.find(a => a.id === active);

  const uploadPro = async (files: FileList) => {
    if (!active) return; setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const pres = await fetch("/api/admin/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ albumId: active, filename: file.name, contentType: file.type, bytes: file.size }) });
        const plan = await pres.json();
        if (plan.mode === "single") { await fetch(plan.url, { method: "PUT", body: file, headers: { "content-type": file.type } }); await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId }) }); }
      } catch {}
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6" style={style}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="display text-3xl">{gallery.name}</h1><p className="data text-[var(--text-2)]">{gallery.short_code} · /g/{gallery.slug}</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPanel("links")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Link2 size={15} />Upload links</button>
          <button onClick={() => setPanel("brand")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Palette size={15} />Branding</button>
          <button onClick={() => setPanel("access")} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">{gallery.view_password_hash ? <Lock size={15} /> : <KeyRound size={15} />}Access</button>
          <a href={`/g/${gallery.slug}`} target="_blank" className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Eye size={15} />View</a>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {albums.map(al => (
          <button key={al.id} onClick={() => setActive(al.id)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${active === al.id ? "bg-[var(--text)] text-[var(--bg)]" : "border border-[var(--border)] text-[var(--text-2)]"}`}>
            {al.is_private && <Lock size={12} />}{al.is_guest_album && <Users size={12} />}{al.name}<span className="opacity-60">{al.visible}</span>
          </button>
        ))}
        <button onClick={() => setPanel("newAlbum")} className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-3)]"><FolderPlus size={14} />Album</button>
      </div>

      {album && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {!album.is_guest_album && <>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-50">{uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}Add photos</button>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={e => e.target.files && uploadPro(e.target.files)} />
          </>}
          <a href={`/g/${gallery.slug}/download?album=${album.slug}`} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"><Download size={15} />Download album</a>
          {!album.is_guest_album && <button onClick={() => fetch("/api/admin/albums", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: album.id, is_private: !album.is_private }) }).then(loadAlbums)} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">{album.is_private ? <><Lock size={15} />Private</> : <><Eye size={15} />Public</>}</button>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {assets.map(a => { const on = sel.has(a.id); return (
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
              {sel.size === 1 && <>
                <button onClick={() => setCover([...sel][0], "album")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs" title="Use as this album's cover"><Star size={12} />Album cover</button>
                <button onClick={() => setCover([...sel][0], "gallery")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs" title="Use as this gallery's cover"><Star size={12} />Gallery cover</button>
                <button onClick={() => setPanel("editCredit")} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"><Pencil size={12} />Edit credit</button>
              </>}
              <span className="data text-[var(--text-2)]">Move to</span>
              {albums.filter(al => al.id !== active).map(al => <button key={al.id} onClick={() => move(al.id)} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs"><Move size={12} />{al.name}</button>)}
              {isOwner && <button onClick={remove} className="btn-ghost flex items-center gap-1 px-2.5 py-1.5 text-xs text-[var(--brand)]"><Trash2 size={12} />Delete</button>}
            </div>
          </div>
        </div>
      )}

      {panel === "links" && <LinksPanel gallery={gallery} albums={albums} links={links} onClose={() => setPanel(null)} reload={loadLinks} showQr={(t) => { setQrToken(t); setPanel("qr"); }} />}
      {panel === "qr" && <QRModal gallery={gallery} token={qrToken} onClose={() => setPanel("links")} />}
      {panel === "newAlbum" && <NewAlbumModal galleryId={gallery.id} onClose={() => setPanel(null)} onDone={() => { setPanel(null); loadAlbums(); }} />}
      {panel === "brand" && <BrandModal gallery={gallery} onClose={() => setPanel(null)} />}
      {panel === "access" && <AccessModal gallery={gallery} onClose={() => setPanel(null)} />}
      {panel === "editCredit" && <EditCreditModal current={assets.find(a => a.id === [...sel][0])} onClose={() => setPanel(null)} onDone={() => { setPanel(null); setSel(new Set()); loadAssets(); }} assetIds={[...sel]} />}
    </div>
  );
}

function LinksPanel({ gallery, albums, links, onClose, reload, showQr }: any) {
  const [mode, setMode] = useState<"open" | "pin" | "photographer">("open");
  const [pin, setPin] = useState(""); const [name, setName] = useState(""); const [albumId, setAlbumId] = useState(""); const [label, setLabel] = useState("");
  const [copied, setCopied] = useState("");
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const create = async () => { await fetch("/api/admin/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ galleryId: gallery.id, mode, pin, contributorName: name, targetAlbumId: albumId || null, label }) }); setPin(""); setName(""); setLabel(""); reload(); };
  const revoke = async (id: string) => { await fetch("/api/admin/links", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); reload(); };
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
  const save = async () => {
    setBusy(true); setErr("");
    try {
      // Unchecked -> clear. Checked + typed a password -> set it. Checked + left
      // blank with a password already set -> omit the field, keep it as-is.
      const body: any = { id: gallery.id };
      if (!protectedNow) body.view_password = "";
      else if (password) body.view_password = password;
      const r = await fetch("/api/admin/galleries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't save. Has the db/002_customisation.sql migration been applied?"); return; }
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
      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      <button onClick={save} disabled={busy || (protectedNow && !gallery.view_password_hash && !password)} className="btn-primary w-full py-2.5 disabled:opacity-30">{busy ? "Saving…" : "Save"}</button>
    </Modal>
  );
}
function EditCreditModal({ current, assetIds, onClose, onDone }: any) {
  const [name, setName] = useState(current?.contributor || "");
  return (
    <Modal title="Edit credit" onClose={onClose}>
      <p className="data mb-3 text-[var(--text-3)]">Renames the credited contributor everywhere — including their other photos in this gallery.</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="mb-4 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
      <button onClick={() => fetch("/api/admin/assets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds, creditName: name }) }).then(onDone)} disabled={!name.trim()} className="btn-primary w-full py-2.5 disabled:opacity-30">Save</button>
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
