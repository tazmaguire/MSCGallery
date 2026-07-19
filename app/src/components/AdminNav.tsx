import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
export default function AdminNav({ user, pending }: { user: any; pending?: number }) {
  return (
    <>
    <nav className="border-b border-[var(--border)] bg-[var(--bg-2)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="display text-lg">POINT RADIUS</span>
          <div className="flex gap-1">
            <Link href="/admin" className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Galleries</Link>
            <Link href="/admin/queue" className="relative rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Queue{pending ? <span className="ml-1.5 rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">{pending}</span> : null}</Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="data text-[var(--text-3)]">{user.display_name}{user.role === "owner" && <span className="ml-1.5 rounded bg-[var(--brand)]/15 px-1.5 py-0.5 text-[var(--brand)]">OWNER</span>}</span>
          <ThemeToggle />
        </div>
      </div>
    </nav>
    <div className="turnout-stripe--thin" />
    </>
  );
}
