import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/siteConfig";
export default function AdminNav({ user, pending }: { user: any; pending?: number }) {
  const site = siteConfig();
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--bg-2)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {site.logoUrl ? <img src={site.logoUrl} alt={site.name} className="h-6 w-auto" /> : <span className="display text-lg">{site.name.toUpperCase()}</span>}
          <div className="flex gap-1">
            <Link href="/admin" className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Galleries</Link>
            <Link href="/admin/queue" className="relative rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Queue{pending ? <span className="ml-1.5 rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">{pending}</span> : null}</Link>
            {user.role === "owner" && <Link href="/admin/users" className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Users</Link>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/account" className="data text-[var(--text-3)] transition hover:text-[var(--text)]">{user.display_name}{user.role === "owner" && <span className="ml-1.5 rounded bg-[var(--brand)]/15 px-1.5 py-0.5 text-[var(--brand)]">OWNER</span>}</Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
