/**
 * Pure display-mode logic for site identity (logo/name), split out of
 * siteConfig.ts so client components (LoginForm, etc.) can import it without
 * pulling in db.ts — which uses Node-only builtins (pg -> fs/net/tls/dns)
 * that can't be bundled for the browser.
 */
export type DisplayMode = "logo" | "name" | "both";

/**
 * Shared logo/name visibility decision for the three places site identity
 * renders (SiteHeader, AdminNav, LoginForm) — keeps the fallback logic in
 * one place while each call site keeps its own JSX/sizing.
 *   logo: logo only — falls back to the name if none is uploaded.
 *   name: name only — a logo, even if uploaded, never shows.
 *   both: logo (if any) on the left, name after it.
 */
export function resolveSiteIdentity(displayMode: DisplayMode, logoUrl: string | null) {
  return {
    showLogo: !!logoUrl && displayMode !== "name",
    showName: displayMode === "both" || displayMode === "name" || !logoUrl,
  };
}
