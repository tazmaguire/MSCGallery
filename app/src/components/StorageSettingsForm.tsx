"use client";
import { useState, useEffect } from "react";
import { Loader2, ExternalLink, ShieldCheck } from "lucide-react";

type Guide = { label: string; hint: string };

// Where-to-find-it guides shown under each field — this is the "user guide
// baked into the UI" the settings page exists to provide, so an operator
// never has to leave the app or dig through README files to fill these in.
const GUIDES: Record<string, Guide> = {
  endpoint: { label: "Endpoint", hint: "Cloudflare dashboard → R2 → your bucket → Settings. Looks like https://<ACCOUNT_ID>.r2.cloudflarestorage.com — must also be set as S3_ENDPOINT in deploy/.env (see the note below) or uploads will be blocked by the browser." },
  bucket: { label: "Bucket name", hint: "The bucket's name as shown in the R2 bucket list." },
  region: { label: "Region", hint: "Leave blank — R2 uses \"auto\"." },
  accessKey: { label: "Access key ID", hint: "R2 → Manage API Tokens → Create API Token → Object Read & Write, scoped to this bucket. Shown once at creation." },
  secret: { label: "Secret access key", hint: "Shown alongside the access key ID at creation time only — if lost, create a new token." },
  publicSiteUrl: { label: "Public site URL", hint: "The https:// address guests and QR codes use to reach this gallery, e.g. https://gallery.example.com. Leave blank to auto-detect from the request." },
};

export default function StorageSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ endpoint: "", region: "", bucket: "", accessKey: "", secret: "", publicSiteUrl: "" });
  const [status, setStatus] = useState<{ accessKeySet: boolean; secretSet: boolean; envFallback: Record<string, boolean> } | null>(null);
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/storage").then(r => r.json()).then(d => {
      setF({ endpoint: d.endpoint, region: d.region, bucket: d.bucket, accessKey: "", secret: "", publicSiteUrl: d.publicSiteUrl });
      setStatus({ accessKeySet: d.accessKeySet, secretSet: d.secretSet, envFallback: d.envFallback });
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setErr(""); setOk(""); setBusy(true);
    try {
      const r = await fetch("/api/admin/settings/storage", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't save changes."); return; }
      setOk("Saved. Takes effect immediately for the app; restart the worker container to pick it up there too.");
      setF(prev => ({ ...prev, accessKey: "", secret: "" }));
      setStatus(prev => prev && { ...prev, accessKeySet: prev.accessKeySet || !!f.accessKey, secretSet: prev.secretSet || !!f.secret });
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-lg px-4 py-6"><Loader2 className="animate-spin text-[var(--text-3)]" size={20} /></div>;

  const field = (key: keyof typeof f, opts?: { type?: string; placeholder?: string; envSet?: boolean; valueSet?: boolean }) => {
    const g = GUIDES[key];
    return (
      <div key={key}>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">{g.label}</label>
        <input
          type={opts?.type || "text"}
          value={f[key]}
          onChange={e => setF({ ...f, [key]: e.target.value })}
          placeholder={opts?.valueSet ? "•••••••••••••••• (set — leave blank to keep)" : opts?.envSet ? "using deploy/.env value — leave blank to keep" : opts?.placeholder || ""}
          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]"
        />
        <p className="data mt-1.5 text-[var(--text-3)]">{g.hint}</p>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="display mb-1 text-3xl">Storage</h1>
      <p className="data mb-5 text-[var(--text-2)]">
        Where photos and videos actually live — an S3-compatible bucket (this app is built and tested against{" "}
        <a href="https://developers.cloudflare.com/r2/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">Cloudflare R2<ExternalLink size={11} /></a>{" "}
        for its free egress). Values saved here are encrypted at rest and override anything set in <code className="data">deploy/.env</code>.
      </p>

      <div className="card mb-4 space-y-4 p-4">
        {field("endpoint", { placeholder: "https://<ACCOUNT_ID>.r2.cloudflarestorage.com", envSet: status?.envFallback.endpoint && !f.endpoint })}
        {field("bucket", { placeholder: "my-gallery-bucket", envSet: status?.envFallback.bucket && !f.bucket })}
        {field("region", { placeholder: "auto", envSet: status?.envFallback.region && !f.region })}
        {field("accessKey", { valueSet: status?.accessKeySet, envSet: status?.envFallback.accessKey && !status?.accessKeySet })}
        {field("secret", { type: "password", valueSet: status?.secretSet, envSet: status?.envFallback.secret && !status?.secretSet })}
      </div>

      <div className="card mb-4 flex items-start gap-2.5 p-4 text-[var(--text-2)]">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
        <p className="data">
          Changing the endpoint here does <strong>not</strong> update the browser's upload permission (CSP) — that's
          still read from <code>S3_ENDPOINT</code> in <code>deploy/.env</code> at container start. If you move to a
          different R2 endpoint, update it there too and redeploy, or guest uploads will fail even though the app's
          own storage calls work fine.
        </p>
      </div>

      <div className="card mb-4 space-y-3 p-4">
        <h2 className="display text-lg">Domain</h2>
        {field("publicSiteUrl", { placeholder: "https://gallery.example.com" })}
      </div>

      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      {ok && <p className="data mb-3 text-emerald-400">{ok}</p>}
      <button onClick={save} disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
    </div>
  );
}
