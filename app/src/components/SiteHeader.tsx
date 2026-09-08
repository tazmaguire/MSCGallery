import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { resolveSiteIdentity, type DisplayMode } from "@/lib/siteIdentity";

type Crumb = { label: string; href?: string };

/** Slim persistent top bar: site logo/name linking home, plus an optional breadcrumb. */
export default function SiteHeader({ siteName, logoUrl, displayMode = "both", crumbs = [] }: { siteName: string; logoUrl?: string | null; displayMode?: DisplayMode; crumbs?: Crumb[] }) {
  const { showLogo, showName } = resolveSiteIdentity(displayMode, logoUrl ?? null);
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-2)]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {showLogo && <img src={logoUrl!} alt={siteName} className="h-5 w-auto" />}
          {showName && <span className="display text-sm">{siteName.toUpperCase()}</span>}
        </Link>
        {crumbs.length > 0 && (
          <nav className="data flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[var(--text-3)]">
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight size={12} className="shrink-0 opacity-50" />
                {/* truncate does nothing without a bounded width — inside this
                    flex row it just grows to fit, so the whole bar relies on
                    overflow-x-auto with no visual hint there's more offscreen.
                    An explicit max-width makes long names actually shrink. */}
                {c.href ? <Link href={c.href} className="max-w-[7rem] truncate transition hover:text-[var(--text)] sm:max-w-[12rem]">{c.label}</Link> : <span className="max-w-[7rem] truncate text-[var(--text-2)] sm:max-w-[12rem]">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
