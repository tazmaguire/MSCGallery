"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Terminal, Download } from "lucide-react";

const POLL_MS = 15_000;

export default function UpdatesPanel() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => fetch("/api/admin/update").then(r => r.json()).then(setData).catch(() => {});
  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const trigger = async () => {
    setErr(""); setTriggering(true);
    try {
      const r = await fetch("/api/admin/update", { method: "POST" });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Couldn't request an update."); return; }
      load();
    } finally { setTriggering(false); }
  };

  if (!data) return <div className="mx-auto max-w-lg px-4 py-8"><RefreshCw size={18} className="animate-spin text-[var(--text-3)]" /></div>;

  const { status, log, deployedSha, watcherInstalled } = data;
  const updating = status?.updating;
  const behind = Number(status?.behind_by ?? 0);
  const upToDate = watcherInstalled && behind === 0 && !updating;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="display mb-1 text-2xl">Updates</h1>
      <p className="data mb-5 text-[var(--text-2)]">Pull the latest code and redeploy — no SSH needed.</p>

      {!watcherInstalled ? (
        <div className="card mb-4 p-4">
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"><AlertCircle size={15} />Updater not installed yet</div>
          <p className="data text-[var(--text-2)]">
            This is a one-time server-side setup (installs a small watcher service) — see "Self-update" in HANDOFF.md for the exact steps. Until then, updates still go through <code className="data">./deploy/update.sh</code> over SSH.
          </p>
        </div>
      ) : (
        <div className="card mb-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            {updating ? <RefreshCw size={16} className="animate-spin text-[var(--accent)]" />
              : upToDate ? <CheckCircle2 size={16} className="text-emerald-400" />
              : <Download size={16} className="text-[var(--accent)]" />}
            <span className="text-sm font-semibold">
              {updating ? "Updating — this briefly takes the site offline while it rebuilds…"
                : upToDate ? "Up to date"
                : `${behind} commit${behind === 1 ? "" : "s"} behind`}
            </span>
          </div>
          <div className="data mb-3 space-y-0.5 text-[var(--text-3)]">
            <div>Running: <span className="text-[var(--text-2)]">{deployedSha || "dev"}</span></div>
            <div>Latest: <span className="text-[var(--text-2)]">{status?.latest_sha || "checking…"}</span></div>
            {status?.checked_at && <div>Checked: {new Date(status.checked_at).toLocaleString()}</div>}
          </div>
          {status?.last_result === "success" && <p className="data mb-3 text-emerald-400">Last update succeeded.</p>}
          {status?.last_result === "error" && <p className="data mb-3 text-[var(--brand)]">{status.last_error || "Last update failed."}</p>}
          {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
          <button onClick={trigger} disabled={updating || triggering || upToDate}
            className="btn-primary w-full py-2.5 text-sm disabled:opacity-40">
            {updating ? "Updating…" : upToDate ? "Nothing to update" : triggering ? "Requesting…" : "Update now"}
          </button>
        </div>
      )}

      {log && (
        <div className="card p-4">
          <button onClick={() => setShowLog(s => !s)} className="flex w-full items-center gap-2 text-sm font-semibold text-[var(--text-2)]">
            <Terminal size={15} />{showLog ? "Hide" : "Show"} recent log
          </button>
          {showLog && <pre className="data mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--bg-2)] p-3 text-[11px] text-[var(--text-2)]">{log}</pre>}
        </div>
      )}
    </div>
  );
}
