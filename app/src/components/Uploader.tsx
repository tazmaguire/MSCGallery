"use client";
/**
 * Guest uploader. Same component serves open and PIN links (photographer links
 * skip this and use the admin ingest path). Consent checkbox is required and the
 * licence text comes from the gallery config. PIN links show a gate first.
 */
import { useState, useRef, useCallback } from "react";
import { Upload, Check, AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";

type Job = { id: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };
const PARALLEL = 4;

export default function Uploader({ token, mode, galleryName, terms, brand }: {
  token: string; mode: "open" | "pin"; galleryName: string; terms: string; brand: { primary: string; accent: string };
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [pin, setPin] = useState(""); const [pinOk, setPinOk] = useState(mode === "open");
  const [agreed, setAgreed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [gateError, setGateError] = useState("");
  const sessionId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const style = { ["--brand" as any]: brand.primary, ["--accent" as any]: brand.accent } as React.CSSProperties;
  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const uploadOne = useCallback(async (job: Job) => {
    patch(job.id, { status: "uploading", progress: 0 });
    try {
      const pres = await fetch("/api/upload/presign", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, filename: job.file.name, contentType: job.file.type || "application/octet-stream", bytes: job.file.size, uploaderName: name, uploaderEmail: email, pin, agreed, sessionId: sessionId.current }) });
      if (!pres.ok) { const e = await pres.json(); if (e.needPin) { setPinOk(false); setGateError("Session expired — re-enter the PIN."); } throw new Error(e.error || "Couldn't start upload."); }
      const plan = await pres.json();
      sessionId.current = plan.sessionId;
      if (plan.mode === "single") {
        await put(plan.url, job.file, (p) => patch(job.id, { progress: p }));
        await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId }) });
      } else {
        const parts: any[] = []; const done = new Array(plan.urls.length).fill(0);
        const one = async (i: number) => { const chunk = job.file.slice(i * plan.partSize, (i + 1) * plan.partSize);
          const etag = await put(plan.urls[i], chunk, (p) => { done[i] = (p / 100) * chunk.size; patch(job.id, { progress: Math.round(done.reduce((a, b) => a + b, 0) / job.file.size * 100) }); });
          parts.push({ ETag: etag, PartNumber: i + 1 }); };
        const queue = plan.urls.map((_: any, i: number) => i);
        await Promise.all(Array.from({ length: PARALLEL }, async () => { for (;;) { const i = queue.shift(); if (i === undefined) return; await one(i); } }));
        await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId, uploadId: plan.uploadId, parts }) });
      }
      patch(job.id, { status: "done", progress: 100 });
    } catch (e: any) { patch(job.id, { status: "error", error: e.message }); }
  }, [token, name, email, pin, agreed]);

  const add = useCallback((files: FileList | File[]) => {
    if (!name.trim() || !agreed) return;
    const next: Job[] = Array.from(files).map((file) => ({ id: crypto.randomUUID(), file, progress: 0, status: "queued" }));
    setJobs((j) => [...j, ...next]);
    (async () => { const queue = [...next]; await Promise.all(Array.from({ length: 2 }, async () => { for (;;) { const j = queue.shift(); if (!j) return; await uploadOne(j); } })); })();
  }, [name, agreed, uploadOne]);

  const done = jobs.filter((j) => j.status === "done").length;
  const ready = name.trim() && agreed;

  // PIN gate first
  if (!pinOk) return (
    <div className="grid min-h-screen place-items-center px-4" style={style}>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--surface)]"><Lock size={20} className="text-[var(--text-2)]" /></div>
        <div className="eyebrow mb-1">{galleryName}</div>
        <h1 className="display mb-2 text-3xl">Enter the PIN</h1>
        <p className="data mb-5 text-[var(--text-2)]">This upload link is protected. Enter the PIN you were given.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="••••"
          className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-[var(--text-2)]" />
        {gateError && <p className="data mb-3 text-[var(--brand)]">{gateError}</p>}
        <button onClick={() => { if (pin.length >= 4) { setPinOk(true); setGateError(""); } }} className="btn-primary w-full py-3">Continue</button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8" style={style}>
      <header className="mb-6">
        <div className="eyebrow mb-2">{galleryName}</div>
        <h1 className="display text-4xl">Share your photos</h1>
        <p className="mt-2 text-[var(--text-2)]">Send us what you shot on the day. We'll credit you, and they'll appear once we've had a quick look.</p>
      </header>
      <div className="turnout-stripe--thin mb-6 rounded" />

      <div className="card mb-4 space-y-3 p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Your name <span className="text-[var(--brand)]">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="So we can credit you" className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-base outline-none focus:border-[var(--text-2)]" />
          <p className="data mt-1.5 text-[var(--text-3)]">Shown as "Shot by {name.trim().split(/\s+/)[0] || "your name"}" and written into the photo.</p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Email <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-base outline-none focus:border-[var(--text-2)]" />
        </div>
      </div>

      {/* Consent — required */}
      <label className="card mb-4 flex cursor-pointer gap-3 p-4">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
        <span className="text-sm text-[var(--text-2)]">
          <span className="mb-1 flex items-center gap-1.5 font-medium text-[var(--text)]"><ShieldCheck size={14} /> Photo upload terms</span>
          {terms}
        </span>
      </label>

      <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
        onClick={() => ready && inputRef.current?.click()}
        className={`cursor-pointer rounded-[var(--radius)] border-2 border-dashed p-10 text-center transition ${!ready ? "cursor-not-allowed border-[var(--border)] opacity-40" : dragging ? "border-[var(--accent)] bg-white/5" : "border-[var(--border)] hover:border-[var(--text-3)]"}`}>
        <Upload size={28} className="mx-auto mb-3 text-[var(--text-2)]" />
        <p className="text-sm font-medium">{!name.trim() ? "Enter your name first" : !agreed ? "Agree to the terms to continue" : "Tap to choose, or drop photos here"}</p>
        <p className="data mt-1 text-[var(--text-3)]">Photos and video from your camera roll</p>
        <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
      </div>

      {jobs.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="data text-[var(--text-2)]">{done} of {jobs.length} uploaded</div>
          {jobs.map((j) => (
            <div key={j.id} className="card flex items-center gap-3 px-3 py-2.5">
              <div className="shrink-0">
                {j.status === "done" && <Check size={16} className="text-emerald-400" />}
                {j.status === "error" && <AlertCircle size={16} className="text-[var(--brand)]" />}
                {j.status === "uploading" && <Loader2 size={16} className="animate-spin text-[var(--text-2)]" />}
                {j.status === "queued" && <div className="h-4 w-4 rounded-full bg-white/10" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{j.file.name}</div>
                {j.status === "uploading" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full transition-all" style={{ width: `${j.progress}%`, background: "var(--brand)" }} /></div>}
                {j.error && <div className="data mt-1 text-[var(--brand)]">{j.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {done > 0 && done === jobs.length && (
        <div className="mt-6 rounded-[var(--radius)] border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-300">Thank you — they're with us.</p>
          <p className="data mt-1 text-[var(--text-2)]">We'll take a quick look and they'll appear on the gallery shortly.</p>
        </div>
      )}
    </div>
  );
}
function put(url: string, body: Blob, onP: (p: number) => void): Promise<string> {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open("PUT", url);
    x.upload.onprogress = (e) => e.lengthComputable && onP(Math.round(e.loaded / e.total * 100));
    x.onload = () => x.status >= 200 && x.status < 300 ? res((x.getResponseHeader("ETag") || "").replace(/"/g, "")) : rej(new Error(`Upload failed (${x.status})`));
    x.onerror = () => rej(new Error("Network error. On mobile data? Try wifi."));
    x.send(body);
  });
}
