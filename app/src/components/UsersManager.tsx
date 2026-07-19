"use client";
import { useState, useEffect } from "react"; import { Plus, Trash2 } from "lucide-react";
export default function UsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<any[]>([]); const [show, setShow] = useState(false); const [err, setErr] = useState("");
  const load = () => fetch("/api/admin/users").then(r => r.json()).then(d => setUsers(d.users || []));
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Remove this user? They'll lose access immediately.")) return;
    const r = await fetch("/api/admin/users", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error || "Couldn't remove user."); return; }
    load();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="display text-3xl">Users</h1>
        <button onClick={() => setShow(true)} className="btn-primary flex items-center gap-2 px-3 py-2 text-sm"><Plus size={15} />New user</button>
      </div>
      {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="card flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="font-medium">{u.display_name}</span>{u.role === "owner" && <span className="rounded bg-[var(--brand)]/15 px-1.5 py-0.5 text-xs text-[var(--brand)]">OWNER</span>}</div>
              <div className="data text-[var(--text-2)]">{u.email}</div>
            </div>
            {u.id !== currentUserId && <button onClick={() => remove(u.id)} className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--brand)]"><Trash2 size={13} />Remove</button>}
          </div>
        ))}
        {!users.length && <p className="data text-[var(--text-2)]">No users yet.</p>}
      </div>
      {show && <NewUser onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}
function NewUser({ onClose, onDone }: any) {
  const [f, setF] = useState({ email: "", display_name: "", password: "", role: "moderator" });
  const [err, setErr] = useState("");
  const create = async () => {
    setErr("");
    const r = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    if (!r.ok) { setErr(d.error || "Couldn't create user."); return; }
    onDone();
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5" onClick={e => e.stopPropagation()}>
        <h2 className="display mb-4 text-xl">New user</h2>
        <div className="mb-3"><label className="data mb-1.5 block text-[var(--text-2)]">Display name</label>
          <input value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" /></div>
        <div className="mb-3"><label className="data mb-1.5 block text-[var(--text-2)]">Email</label>
          <input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" /></div>
        <div className="mb-3"><label className="data mb-1.5 block text-[var(--text-2)]">Password (12+ characters)</label>
          <input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" /></div>
        <div className="mb-4"><label className="data mb-1.5 block text-[var(--text-2)]">Role</label>
          <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5">
            <option value="moderator">Moderator</option>
            <option value="owner">Owner</option>
          </select></div>
        {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
        <button onClick={create} disabled={!f.email || !f.display_name || !f.password} className="btn-primary w-full py-2.5 disabled:opacity-30">Create user</button>
      </div>
    </div>
  );
}
