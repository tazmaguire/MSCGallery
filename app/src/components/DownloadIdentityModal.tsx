"use client";
import { useState } from "react";
import { User, X } from "lucide-react";

export default function DownloadIdentityModal({ onSuccess, onClose }: { onSuccess: (name: string, email: string) => void; onClose: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-4" onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-[var(--radius)] bg-[var(--surface)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-[var(--text-3)] hover:text-[var(--text)]"><X size={18} /></button>
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--bg-2)]"><User size={20} className="text-[var(--text-2)]" /></div>
        <h2 className="display mb-2 text-2xl">Who's downloading?</h2>
        <p className="data mb-5 text-[var(--text-2)]">Just so the gallery owner knows who's grabbed photos. Asked once per visit.</p>
        <div className="mb-1.5 text-left">
          <label className="mb-1.5 block text-sm font-medium">Your name <span className="text-[var(--brand)]">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && onSuccess(name.trim(), email.trim())} placeholder="Your name"
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
        <div className="mb-4 text-left">
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Email <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && onSuccess(name.trim(), email.trim())}
            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 outline-none focus:border-[var(--text-2)]" />
        </div>
        <button onClick={() => onSuccess(name.trim(), email.trim())} disabled={!name.trim()} className="btn-primary w-full py-3 disabled:opacity-50">Continue to download</button>
      </div>
    </div>
  );
}
