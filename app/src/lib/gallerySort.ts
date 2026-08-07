import type { GallerySortMode } from "./siteConfig";

/**
 * The resolved ORDER BY fragment for a gallery listing (home page, both
 * gallery-listing embed routes) — always aliased `gal`. Returns a fixed
 * string from a small whitelist (never interpolates the raw mode value), so
 * it's safe to splice directly into a query despite not being a bind param —
 * Postgres has no way to parameterise a column/direction choice itself.
 */
export function gallerySortClause(mode: GallerySortMode): string {
  switch (mode) {
    case "date_desc": return "gal.event_date DESC NULLS LAST";
    case "name_asc": return "gal.name ASC";
    case "name_desc": return "gal.name DESC";
    case "custom": return "gal.sort_order, gal.event_date ASC NULLS LAST";
    case "date_asc": default: return "gal.event_date ASC NULLS LAST";
  }
}
