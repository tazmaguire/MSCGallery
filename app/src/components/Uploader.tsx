"use client";
/**
 * Guest uploader. Serves open, PIN, and photographer links — photographer
 * links skip the PIN gate and the name/email/consent card since the
 * contributor is already bound to the link server-side. Consent checkbox is
 * required for open/PIN links; the licence text comes from the gallery
 * config. PIN links show a gate first.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Check, AlertCircle, Loader2, Lock, ShieldCheck, X, Info, Images, RotateCcw, Camera, Video } from "lucide-react";

type Job = { id: string; file: File; progress: number; status: "staged" | "queued" | "uploading" | "verifying" | "done" | "error"; error?: string };
const PARALLEL = 4;
// A tab backgrounded/suspended by iOS Safari mid-upload freezes ALL JS on the
// page — including any in-page stall timer — so this alone can't catch that
// case; it's the visibilitychange handler below that does. This constant is
// for the separate, more common case: the tab stays foregrounded but the
// connection genuinely stalls (dead wifi, a hung server) with zero progress.
const STALL_MS = 45_000;
// How long a job can sit at "uploading" with no progress before the
// visibilitychange handler (fires when the tab becomes visible again, e.g.
// after an iOS background-suspend) gives up on it and marks it retryable.
const VISIBILITY_STALE_MS = 2 * 60_000;

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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const style = { ["--brand" as any]: brand.primary, ["--accent" as any]: brand.accent } as React.CSSProperties;
  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
  // Last time each in-flight job made any progress — seeded when a job
  // starts uploading, refreshed on every progress tick. Read by the
  // visibilitychange recovery below to spot a job that was silently frozen
  // (e.g. the tab got backgrounded/suspended by iOS mid-upload) rather than
  // one that's just slow.
  const lastProgressAt = useRef<Map<string, number>>(new Map());
  // Identifies which *attempt* at a given job id is the current one — a
  // plain "is this job still uploading?" check isn't enough once retries
  // exist: the visibilitychange recovery below can abandon a frozen attempt
  // while its actual network requests keep running in the background
  // (marking the job an error doesn't cancel them); if the guest then taps
  // Retry, a NEW attempt starts and immediately becomes "uploading" again —
  // and the old, abandoned attempt's late-arriving success/failure would
  // otherwise stomp over the new attempt's state the moment it resolves.
  // Bumped on every uploadOne() call and by the abandon path; a resolution
  // whose token no longer matches is stale and silently ignored.
  const attemptToken = useRef<Map<string, number>>(new Map());

  const uploadOne = useCallback(async (job: Job) => {
    const myToken = (attemptToken.current.get(job.id) ?? 0) + 1;
    attemptToken.current.set(job.id, myToken);
    const isCurrent = () => attemptToken.current.get(job.id) === myToken;
    patch(job.id, { status: "uploading", progress: 0 });
    lastProgressAt.current.set(job.id, Date.now());
    const markProgress = (p: number) => { lastProgressAt.current.set(job.id, Date.now()); patch(job.id, { progress: p }); };
    try {
      const pres = await fetch("/api/upload/presign", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, filename: job.file.name, contentType: job.file.type || "application/octet-stream", bytes: job.file.size, uploaderName: name, uploaderEmail: email, pin, agreed, sessionId: sessionId.current }) });
      if (!pres.ok) { const e = await pres.json(); if (e.needPin) { setPinOk(false); setGateError("Session expired — re-enter the PIN."); } throw new Error(e.error || "Couldn't start upload."); }
      const plan = await pres.json();
      sessionId.current = plan.sessionId;
      let completeRes: Response;
      if (plan.mode === "single") {
        await put(plan.url, job.file, markProgress);
        if (isCurrent()) patch(job.id, { status: "verifying" });
        completeRes = await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId }) });
      } else {
        const parts: any[] = []; const done = new Array(plan.urls.length).fill(0);
        const one = async (i: number) => { const chunk = job.file.slice(i * plan.partSize, (i + 1) * plan.partSize);
          const etag = await put(plan.urls[i], chunk, (p) => { done[i] = (p / 100) * chunk.size; markProgress(Math.round(done.reduce((a, b) => a + b, 0) / job.file.size * 100)); });
          parts.push({ ETag: etag, PartNumber: i + 1 }); };
        const queue = plan.urls.map((_: any, i: number) => i);
        await Promise.all(Array.from({ length: PARALLEL }, async () => { for (;;) { const i = queue.shift(); if (i === undefined) return; await one(i); } }));
        if (isCurrent()) patch(job.id, { status: "verifying" });
        completeRes = await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: plan.assetId, uploadId: plan.uploadId, parts }) });
      }
      // "verifying" is a real, distinct step, not cosmetic — the server
      // checks R2's own recorded size for the uploaded object against what
      // this file actually is (api/upload/complete, verifyObjectSize in
      // storage.ts) before this resolves, so a truncated/corrupted upload
      // is caught here instead of getting a false success checkmark. A
      // non-2xx here used to be ignored entirely — the job still flipped to
      // "done" even when the server's own check failed.
      if (!completeRes.ok) { const e = await completeRes.json().catch(() => ({})); throw new Error(e.error || "Upload didn't finish — please retry."); }
      if (isCurrent()) patch(job.id, { status: "done", progress: 100 });
    } catch (e: any) { if (isCurrent()) patch(job.id, { status: "error", error: e.message }); }
    // Only clear this attempt's own bookkeeping — a stale attempt resolving
    // late must not wipe out a newer retry's in-progress lastProgressAt
    // entry (keyed by job id, not by attempt).
    finally { if (isCurrent()) lastProgressAt.current.delete(job.id); }
  }, [token, name, email, pin, agreed]);

  // Recovers jobs silently frozen by an iOS Safari background-suspend: JS
  // execution (including the in-page stall timer in put()) is paused while
  // the tab is hidden, so nothing can notice mid-freeze. The moment the tab
  // is visible again, check every still-"uploading"/"verifying" job's last
  // progress — if it's stale well beyond what a background-suspend
  // explains, it's never going to finish on its own; surface a retryable
  // error instead of leaving it spinning forever. Covers "verifying" too —
  // that's a real network round-trip (api/upload/complete), not instant,
  // and can freeze mid-flight exactly the same way the PUT itself can.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      setJobs((js) => js.map((j) => {
        if (j.status !== "uploading" && j.status !== "verifying") return j;
        const last = lastProgressAt.current.get(j.id) ?? 0;
        if (now - last > VISIBILITY_STALE_MS) {
          lastProgressAt.current.delete(j.id);
          // Invalidates the abandoned attempt's token — its underlying
          // fetch/XHR keeps running in the background (nothing here cancels
          // it), so without this its late success/failure would still land
          // via isCurrent() and stomp over whatever a subsequent Retry does.
          attemptToken.current.set(j.id, (attemptToken.current.get(j.id) ?? 0) + 1);
          return { ...j, status: "error", error: "Upload was interrupted — tap Retry." };
        }
        return j;
      }));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Files are staged for review first — nothing uploads until Submit.
  const add = useCallback((files: FileList | File[]) => {
    if (submitted) return;
    if (!agreed) return;
    if (mode !== "photographer" && !name.trim()) return;
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
  const ready = agreed && (mode === "photographer" || !!name.trim());
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
          <span className="text-sm">Uploading as <strong>{contributorName || "Photographer"}</strong> — no name needed, this link is already tied to you.</span>
        </div>
      ) : (
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
      )}

      {/* Consent — required in every mode, including photographer links. */}
      <label className="card mb-4 flex cursor-pointer gap-3 p-4">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]" />
        <span className="text-sm text-[var(--text-2)]">
          <span className="mb-1 flex items-center gap-1.5 font-medium text-[var(--text)]"><ShieldCheck size={14} /> Photo upload terms</span>
          {terms}
        </span>
      </label>

      {!submitted && (
        <>
          {/* Two separate single-type inputs, not one accept="image/*,video/*"
              input — iOS Safari has a long-standing bug where combining
              multiple media types with `multiple` silently falls back to
              single-selection in the native Photos picker. A homogeneous
              accept type doesn't have this problem, so photos (the common
              case) get their own dedicated multi-select picker via the main
              dropzone, and video gets a clearly separate one below. */}
          <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
            onClick={() => ready && photoInputRef.current?.click()}
            className={`cursor-pointer rounded-[var(--radius)] border-2 border-dashed p-10 text-center transition ${!ready ? "cursor-not-allowed border-[var(--border)] opacity-40" : dragging ? "border-[var(--accent)] bg-white/5" : "border-[var(--border)] hover:border-[var(--text-3)]"}`}>
            <Upload size={28} className="mx-auto mb-3 text-[var(--text-2)]" />
            <p className="text-sm font-medium">{!ready ? (mode !== "photographer" && !name.trim() ? "Enter your name first" : "Agree to the terms to continue") : staged.length ? "Add more photos" : "Tap to choose, or drop photos here"}</p>
            <p className="data mt-1 text-[var(--text-3)]">Photos from your camera roll</p>
            <input ref={photoInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
          </div>
          <button type="button" onClick={() => ready && videoInputRef.current?.click()} disabled={!ready}
            className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-3)] transition hover:text-[var(--text-2)] disabled:cursor-not-allowed disabled:opacity-40">
            <Video size={14} />Uploading a video instead?
          </button>
          <input ref={videoInputRef} type="file" multiple accept="video/*" className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
        </>
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
                {(j.status === "uploading" || j.status === "verifying") && <Loader2 size={16} className="animate-spin text-[var(--text-2)]" />}
                {(j.status === "queued" || j.status === "staged") && <div className="h-4 w-4 rounded-full bg-white/10" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{j.file.name}</div>
                {(j.status === "uploading" || j.status === "verifying") && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full transition-all" style={{ width: `${j.status === "verifying" ? 100 : j.progress}%`, background: "var(--brand)" }} /></div>}
                {/* A visible, distinct step — not folded silently into
                    "uploading" — so the guest sees that a real integrity
                    check happens before the tick, not just an animation. */}
                {j.status === "verifying" && <div className="data mt-1 text-[var(--text-3)]">Verifying upload…</div>}
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
    let last = Date.now();
    x.upload.onprogress = (e) => { last = Date.now(); e.lengthComputable && onP(Math.round(e.loaded / e.total * 100)); };
    // Stall detection by INACTIVITY, not total duration — XHR's own
    // `.timeout` measures time-since-send, which would wrongly kill a huge
    // file on a slow-but-still-working connection. This instead aborts only
    // when nothing has moved for STALL_MS, so a big video that's genuinely
    // still transferring is never cut off, but a truly dead connection is.
    const stallCheck = setInterval(() => {
      if (Date.now() - last > STALL_MS) { clearInterval(stallCheck); x.abort(); }
    }, 5000);
    const cleanup = () => clearInterval(stallCheck);
    x.onload = () => { cleanup(); x.status >= 200 && x.status < 300 ? res((x.getResponseHeader("ETag") || "").replace(/"/g, "")) : rej(new Error(`Upload failed (${x.status})`)); };
    x.onerror = () => {
      cleanup();
      // A request that never got a response almost always means the browser blocked
      // it before it left (CORS preflight rejected by the storage bucket) rather than
      // a flaky connection — log the technical detail for whoever's debugging it.
      console.error(`Upload PUT to storage failed with no response (${url.split("?")[0]}). If this happens on every device/network, check the storage bucket's CORS policy allows PUT from this origin.`);
      rej(new Error("Couldn't reach storage. Please try again — if it keeps happening, let the event organiser know."));
    };
    x.onabort = () => { cleanup(); rej(new Error("Upload stalled — no progress for a while. Tap Retry.")); };
    x.send(body);
  });
}
