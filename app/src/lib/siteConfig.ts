/**
 * Site-wide identity — the app chrome shown before/outside any single gallery
 * (title, admin nav, login page, home listing). Deliberately separate from
 * per-gallery branding (galleries.brand jsonb), which already lets each event
 * set its own colours/logo/intro.
 *
 * Read LAZILY (inside request-time render functions), not at module load —
 * same rule as storage.ts. Every field has a safe default so the app never
 * throws for missing config; operators customise purely via .env.
 */
export function siteConfig() {
  return {
    name: process.env.SITE_NAME?.trim() || "Gallery",
    tagline: process.env.SITE_TAGLINE?.trim() || "Event galleries",
    logoUrl: process.env.SITE_LOGO_URL?.trim() || null,
    primary: process.env.SITE_PRIMARY_COLOR?.trim() || "#E8442A",
    accent: process.env.SITE_ACCENT_COLOR?.trim() || "#C6B400",
  };
}
