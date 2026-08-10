"use client";
/**
 * Guest uploader. Serves open, PIN, and photographer links — photographer
 * links skip the PIN gate and the name/email/consent card since the
 * contributor is already bound to the link server-side. Consent checkbox is
 * required for open/PIN links; the licence text comes from the gallery
 * config. PIN links show a gate first.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Check, AlertCircle, Loader2, Lock, ShieldCheck, X, Info, Images, RotateCcw, Camera } from "lucide-react";

type Job = { id: string; file: File; progress: number; status: "staged" | "queued" | "uploading" | "done" | "error"; error?: string };
const PARALLEL = 4;

export default function Uploader({ token, mode, gallerySlug, galleryName, terms, brand, contributorName }: {
  token: string; mode: "open" | "pin" | "photographer"; gallerySlug: string; galleryName: string; terms: string; brand: { primary: string; accent: string }; contributorName?: string;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [pin, setPin] = useState(""); const [pinOk, setPinOk] = useState(mode !== "pin");
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

  // Files are staged for review first — nothing uploads until Submit.
  const add = useCallback((files: FileList | File[]) => {
    if (submitted) return;
    if (mode !== "photographer" && (!name.trim() || !agreed)) return;
    const next: Job[] = Array.from(files).map((file) => ({ id: crypto.randomUUID(), file, progress: 0, status: "staged" }));
    setJobs((j) => [...j, ...next]);
  }, [name, agreed, submitted, mode]);

  const removeStaged = useCallback((id: string) => setJobs((js) => js.filter((j) => j.id !== id)), []);
  const cancelAll = useCallback(() => setJobs([]), []);

  const submit = useCallback(() => {
    setSubmitted(true);
    const staged = jobs.filter((j) => j.status === "staged");
    const queue = [...staged];
    Promise.all(Array.from({ length: 2 }, async () => { for (;;) { const j = queue.shift(); if (!j) return; await uploadOne(j); } }));
  }, [jobs, uploadOne]);

  // Retry a single failed file without disturbing the rest of the batch.
  const retry = useCallback((job: Job) => { patch(job.id, { error: undefined }); uploadOne(job); }, [uploadOne]);

  // Same contributor/consent stays captured — only the batch of files resets.
  const submitMore = useCallback(() => { setJobs([]); setSubmitted(false); }, []);

  const staged = jobs.filter((j) => j.status === "staged");
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const ready = mode === "photographer" ? true : !!(name.trim() && agreed);
  const allDone = submitted && jobs.length > 0 && jobs.every((j) => j.status === "done");
  // Batch has stopped moving (nothing left staged/queued/uploading) but not
  // every file made it — the full-screen confirmation below only fires on a
  // clean sweep, so this covers the partial-failure case with an inline
  // "submit more / go to gallery" pair, right below the per-file retry buttons.
  const finishedWithErrors = submitted && jobs.length > 0 && failed > 0 && jobs.every((j) => j.status === "done" || j.status === "error");
  const confirmHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (allDone) confirmHeadingRef.current?.focus(); }, [allDone]);

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

  // Post-submission confirmation — replaces the whole form, not a toast.
  if (allDone) return (
    <div className="grid min-h-screen place-items-center px-4" style={style}>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-blue-500/15"><Info size={22} className="text-blue-400" /></div>
        <h1 ref={confirmHeadingRef} tabIndex={-1} className="display mb-3 text-3xl outline-none">
          {done === 1 ? "Photo submitted" : "Photos submitted"}
        </h1>
        <div className="mb-6 rounded-[var(--radius)] border border-blue-500/25 bg-blue-500/10 p-4 text-sm text-blue-100">
          Your {done === 1 ? "photo is" : "photos are"} in the moderation queue and will appear once approved by
          an admin. Thank you for submitting your photos!
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={submitMore} className="btn-ghost flex items-center justify-center gap-2 py-3 font-medium"><RotateCcw size={16} />Submit more</button>
          <a href={`/g/${gallerySlug}`} className="btn-primary flex items-center justify-center gap-2 py-3 font-medium"><Images size={16} />Go to gallery</a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8" style={style}>
      <header className="mb-6">
        <div className="eyebrow mb-2">{galleryName}</div>
        <h1 className="display text-4xl">Share your photos</h1>
        <p className="mt-2 text-[var(--text-2)]">
          {mode === "photographer" ? "Uncapped, uncompressed uploads — send everything you shot." : "Send us what you shot on the day. We'll credit you, and they'll appear once we've had a quick look."}
        </p>
      </header>

      {mode === "photographer" ? (
        <div className="card mb-4 flex items-center gap-3 p-4">
          <Camera size={18} className="shrink-0 text-[var(--text-2)]" />
          <span className="text-sm">Uploading as <strong>{contributorName || "Photographer"}</strong> — no name or terms needed, this link is already tied to you.</span>
        </div>
      ) : (
        <>
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
        </>
      )}

      {!submitted && (
        <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
          onClick={() => ready && inputRef.current?.click()}
          className={`cursor-pointer rounded-[var(--radius)] border-2 border-dashed p-10 text-center transition ${!ready ? "cursor-not-allowed border-[var(--border)] opacity-40" : dragging ? "border-[var(--accent)] bg-white/5" : "border-[var(--border)] hover:border-[var(--text-3)]"}`}>
          <Upload size={28} className="mx-auto mb-3 text-[var(--text-2)]" />
          <p className="text-sm font-medium">{!ready ? (!name.trim() ? "Enter your name first" : "Agree to the terms to continue") : staged.length ? "Add more photos" : "Tap to choose, or drop photos here"}</p>
          <p className="data mt-1 text-[var(--text-3)]">Photos and video from your camera roll</p>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
        </div>
      )}

      {jobs.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="data text-[var(--text-2)]">
            {submitted ? (failed > 0 ? `${done} of ${jobs.length} uploaded — ${failed} couldn't be sent` : `${done} of ${jobs.length} uploaded`) : `${jobs.length} ready to send`}
          </div>
          {jobs.map((j) => (
            <div key={j.id} className="card flex items-center gap-3 px-3 py-2.5">
              <div className="shrink-0">
                {j.status === "done" && <Check size={16} className="text-emerald-400" />}
                {j.status === "error" && <AlertCircle size={16} className="text-[var(--brand)]" />}
                {j.status === "uploading" && <Loader2 size={16} className="animate-spin text-[var(--text-2)]" />}
                {(j.status === "queued" || j.status === "staged") && <div className="h-4 w-4 rounded-full bg-white/10" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{j.file.name}</div>
                {j.status === "uploading" && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full transition-all" style={{ width: `${j.progress}%`, background: "var(--brand)" }} /></div>}
                {j.error && <div className="data mt-1 text-[var(--brand)]">{j.error}</div>}
              </div>
              {!submitted && j.status === "staged" && <button onClick={() => removeStaged(j.id)} className="shrink-0 text-[var(--text-3)] transition hover:text-[var(--brand)]" title="Remove"><X size={16} /></button>}
              {j.status === "error" && <button onClick={() => retry(j)} className="btn-ghost shrink-0 px-3 py-1.5 text-xs font-medium">Retry</button>}
            </div>
          ))}
        </div>
      )}

      {!submitted && staged.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={cancelAll} className="btn-ghost py-3 font-medium">Cancel</button>
          <button onClick={submit} className="btn-primary py-3 font-medium">Submit {staged.length} {staged.length === 1 ? "photo" : "photos"}</button>
        </div>
      )}

      {finishedWithErrors && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={submitMore} className="btn-ghost flex items-center justify-center gap-2 py-3 font-medium"><RotateCcw size={16} />Submit more</button>
          <a href={`/g/${gallerySlug}`} className="btn-primary flex items-center justify-center gap-2 py-3 font-medium"><Images size={16} />Go to gallery</a>
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
    x.onerror = () => {
      // A request that never got a response almost always means the browser blocked
      // it before it left (CORS preflight rejected by the storage bucket) rather than
      // a flaky connection — log the technical detail for whoever's debugging it.
      console.error(`Upload PUT to storage failed with no response (${url.split("?")[0]}). If this happens on every device/network, check the storage bucket's CORS policy allows PUT from this origin.`);
      rej(new Error("Couldn't reach storage. Please try again — if it keeps happening, let the event organiser know."));
    };
    x.send(body);
  });
}
