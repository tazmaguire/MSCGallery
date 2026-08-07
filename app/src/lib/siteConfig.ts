/**
 * Site-wide identity — the app chrome shown before/outside any single gallery
 * (title, admin nav, login page, home listing). Deliberately separate from
 * per-gallery branding (galleries.brand jsonb), which already lets each event
 * set its own colours/logo/intro.
 *
 * Two layers, in priority order: the admin-editable `site_settings` row
 * (db/005_site_settings.sql, set from /admin/settings) wins when present;
 * SITE_* env vars are the fallback for installs that haven't touched the
 * admin UI yet; hardcoded defaults are the last resort. The DB read is
 * wrapped in try/catch — an unmigrated or unreachable DB just means "no
 * overrides yet", never a crash. Safe to call at request time anywhere
 * (never at module load — same rule as storage.ts).
 */
import { q } from "./db";
import type { DisplayMode } from "./siteIdentity";
export type { DisplayMode } from "./siteIdentity";
export { resolveSiteIdentity } from "./siteIdentity";

export type GallerySortMode = "date_asc" | "date_desc" | "name_asc" | "name_desc" | "custom";
export type SiteConfig = {
  name: string; tagline: string; logoUrl: string | null; faviconUrl: string | null;
  primary: string; accent: string; theme: "light" | "dark" | null;
  footerText: string; contactEmail: string; displayMode: DisplayMode; gallerySortMode: GallerySortMode;
};

export async function siteConfig(): Promise<SiteConfig> {
  const cfg: SiteConfig = {
    name: process.env.SITE_NAME?.trim() || "Gallery",
    tagline: process.env.SITE_TAGLINE?.trim() || "Event galleries",
    logoUrl: process.env.SITE_LOGO_URL?.trim() || null,
    faviconUrl: process.env.SITE_FAVICON_URL?.trim() || process.env.SITE_LOGO_URL?.trim() || null,
    primary: process.env.SITE_PRIMARY_COLOR?.trim() || "#E8442A",
    accent: process.env.SITE_ACCENT_COLOR?.trim() || "#C6B400",
    theme: null,
    footerText: "",
    contactEmail: "",
    displayMode: "both",
    gallerySortMode: "date_asc", // "Default to oldest to newest" — explicit product decision, not an arbitrary pick
  };
  try {
    const [row] = await q<any>(`SELECT * FROM site_settings WHERE id=true`);
    if (row) {
      if (row.name) cfg.name = row.name;
      if (row.tagline) cfg.tagline = row.tagline;
      if (row.logo_key) cfg.logoUrl = `/thumbs/${row.logo_key}`;
      if (row.favicon_key) cfg.faviconUrl = `/thumbs/${row.favicon_key}`;
      if (row.primary_color) cfg.primary = row.primary_color;
      if (row.accent_color) cfg.accent = row.accent_color;
      if (row.theme === "light" || row.theme === "dark") cfg.theme = row.theme;
      if (row.footer_text) cfg.footerText = row.footer_text;
      if (row.contact_email) cfg.contactEmail = row.contact_email;
      if (row.display_mode === "logo" || row.display_mode === "name" || row.display_mode === "both") cfg.displayMode = row.display_mode;
      if (["date_asc", "date_desc", "name_asc", "name_desc", "custom"].includes(row.gallery_sort_mode)) cfg.gallerySortMode = row.gallery_sort_mode;
    }
  } catch { /* db/005_site_settings.sql not applied yet, or DB unreachable at this call site — fall back to env/defaults */ }
  return cfg;
}
