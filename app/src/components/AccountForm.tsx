"use client";
import { useState } from "react";
export default function AccountForm({ initial }: { initial: { email: string; display_name: string; role: string } }) {
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [email, setEmail] = useState(initial.email);
  const [currentPw, setCurrentPw] = useState(""); const [newPw, setNewPw] = useState(""); const [confirmPw, setConfirmPw] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(""); setOk("");
    if (newPw && newPw !== confirmPw) { setErr("New passwords don't match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/account", { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: displayName, email, current_password: currentPw || undefined, new_password: newPw || undefined }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "Couldn't save changes."); return; }
      setOk("Saved."); setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <h1 className="display mb-5 text-3xl">My account</h1>

      <div className="card mb-4 space-y-3 p-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Display name</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
        <div className="data text-[var(--text-3)]">Role: {initial.role}</div>
      </div>

      <div className="card mb-4 space-y-3 p-4">
        <h2 className="text-sm font-semibold">Change password</h2>
        <input type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <input type="password" placeholder="New password (12+ characters)" value={newPw} onChange={e => setNewPw(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <input type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <p className="data text-[var(--text-3)]">Leave blank to keep your current password.</p>
      </div>

      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      {ok && <p className="data mb-3 text-emerald-400">{ok}</p>}
      <button onClick={save} disabled={busy} className="btn-primary w-full py-2.5 disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
    </div>
  );
}
