import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import PendingNotifier from "@/components/PendingNotifier";
import { siteConfig, resolveSiteIdentity } from "@/lib/siteConfig";
export default async function AdminNav({ user, pending }: { user: any; pending?: number }) {
  const site = await siteConfig();
  const { showLogo, showName } = resolveSiteIdentity(site.displayMode, site.logoUrl);
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--bg-2)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            {showLogo && <img src={site.logoUrl!} alt={site.name} className="h-6 w-auto" />}
            {showName && <span className="display text-lg">{site.name.toUpperCase()}</span>}
          </span>
          <div className="flex gap-1">
            <Link href="/admin" className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Galleries</Link>
            <Link href="/admin/queue" className="relative rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Queue{pending ? <span className="ml-1.5 rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">{pending}</span> : null}</Link>
            {user.role === "owner" && <Link href="/admin/users" className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Users</Link>}
            {user.role === "owner" && <Link href="/admin/settings" className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-[var(--text-2)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">Settings</Link>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Sanity check for "is my fix actually deployed" — compare against `git log --oneline -1`. */}
          <span className="data hidden text-[var(--text-3)] opacity-50 sm:inline" title="Deployed build (git short SHA)">v{process.env.BUILD_SHA || "dev"}</span>
          <Link href="/admin/account" className="data text-[var(--text-3)] transition hover:text-[var(--text)]">{user.display_name}{user.role === "owner" && <span className="ml-1.5 rounded bg-[var(--brand)]/15 px-1.5 py-0.5 text-[var(--brand)]">OWNER</span>}</Link>
          <PendingNotifier initialPending={pending || 0} />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
