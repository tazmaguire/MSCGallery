import { q } from "@/lib/db"; import Link from "next/link"; import ThemeToggle from "@/components/ThemeToggle";
import { siteConfig } from "@/lib/siteConfig";
export const dynamic = "force-dynamic";
export default async function Home() {
  const site = siteConfig();
  const g = await q(`SELECT slug, name, event_date, location, brand FROM galleries WHERE is_published ORDER BY event_date DESC NULLS LAST`);
  return (
    <div>
      <header className="border-b border-[var(--border)]"><div className="mx-auto max-w-4xl px-6 py-12"><div className="flex items-start justify-between"><div><div className="eyebrow mb-2">{site.name}</div><h1 className="display text-5xl">Galleries</h1></div><ThemeToggle /></div></div></header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-2">
          {g.map((x: any) => (
            <Link key={x.slug} href={`/g/${x.slug}`} className="card flex items-center gap-4 p-4 transition hover:border-[var(--text-3)]">
              <span className="h-12 w-1 rounded-full" style={{ background: x.brand?.primary || "#E8442A" }} />
              <div><div className="display text-xl">{x.name}</div><div className="data text-[var(--text-2)]">{x.location}{x.event_date && ` · ${new Date(x.event_date).toLocaleDateString("en-GB")}`}</div></div>
            </Link>
          ))}
          {!g.length && <p className="data text-[var(--text-2)]">No galleries yet.</p>}
        </div>
      </div>
    </div>
  );
}
