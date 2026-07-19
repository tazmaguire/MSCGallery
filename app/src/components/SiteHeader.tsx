import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };

/** Slim persistent top bar: site logo/name linking home, plus an optional breadcrumb. */
export default function SiteHeader({ siteName, logoUrl, crumbs = [] }: { siteName: string; logoUrl?: string | null; crumbs?: Crumb[] }) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-2)]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt={siteName} className="h-5 w-auto" /> : <span className="display text-sm">{siteName.toUpperCase()}</span>}
        </Link>
        {crumbs.length > 0 && (
          <nav className="data flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[var(--text-3)]">
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight size={12} className="shrink-0 opacity-50" />
                {c.href ? <Link href={c.href} className="truncate transition hover:text-[var(--text)]">{c.label}</Link> : <span className="truncate text-[var(--text-2)]">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
