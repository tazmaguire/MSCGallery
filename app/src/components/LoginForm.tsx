"use client";
import { useState } from "react";
export default function LoginForm({ siteName }: { siteName: string }) {
  const [email, setE] = useState(""); const [pw, setP] = useState(""); const [err, setErr] = useState("");
  const go = async () => { const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) }); if (r.ok) location.href = "/admin"; else setErr("Wrong email or password."); };
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="eyebrow mb-1">{siteName}</div>
        <h1 className="display mb-6 text-4xl">Sign in</h1>
        <input value={email} onChange={e => setE(e.target.value)} placeholder="Email" className="mb-2 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        <input type="password" value={pw} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} placeholder="Password" className="mb-3 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        {err && <p className="data mb-3 text-[var(--brand)]">{err}</p>}
        <button onClick={go} className="btn-primary w-full py-2.5">Sign in</button>
      </div>
    </div>
  );
}
