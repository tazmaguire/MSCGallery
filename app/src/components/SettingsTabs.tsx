"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/settings", label: "Site" },
  { href: "/admin/settings/storage", label: "Storage & domain" },
];

export default function SettingsTabs() {
  const pathname = usePathname();
  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map(t => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href}
              className={`px-3 py-2 text-sm font-medium transition ${active ? "border-b-2 border-[var(--brand)] text-[var(--text)]" : "text-[var(--text-2)] hover:text-[var(--text)]"}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
