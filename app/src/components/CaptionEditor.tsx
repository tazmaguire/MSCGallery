"use client";
import { useEffect, useRef } from "react";
import { Bold, Italic, Link2 } from "lucide-react";

// Deliberately not a full editor library — the scope is exactly three
// commands (bold/italic/link), so a small contentEditable + execCommand
// toolbar covers it without a 50KB+ dependency. execCommand is "deprecated"
// but still universally supported in every evergreen browser for exactly
// this narrow case. Sanitization happens server-side on save, not here —
// this is a UX nicety, never the security boundary.
//
// Uncontrolled by design: the DOM is seeded from `value` once on mount via
// the effect below, then left alone — contentEditable owns its own content
// from then on. Re-applying `value` reactively on every keystroke (e.g. via
// dangerouslySetInnerHTML tied to the value prop) would reset the cursor to
// the start of the field after every character typed.
export default function CaptionEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.innerHTML = value; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (name: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(name, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };
  const link = () => {
    const url = prompt("Link URL:");
    if (url) cmd("createLink", url);
  };
  return (
    <div>
      <div className="mb-1.5 flex gap-1">
        <button type="button" onClick={() => cmd("bold")} title="Bold" className="rounded-[var(--radius)] border border-[var(--border)] p-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><Bold size={13} /></button>
        <button type="button" onClick={() => cmd("italic")} title="Italic" className="rounded-[var(--radius)] border border-[var(--border)] p-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><Italic size={13} /></button>
        <button type="button" onClick={link} title="Add link" className="rounded-[var(--radius)] border border-[var(--border)] p-1.5 text-[var(--text-2)] hover:text-[var(--text)]"><Link2 size={13} /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML); }}
        className="min-h-[100px] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--text-2)] [&_a]:underline [&_a]:text-[var(--accent)]"
      />
    </div>
  );
}
