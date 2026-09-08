import "./globals.css";
import type { Viewport } from "next";
import { cookies } from "next/headers";
import { siteConfig } from "@/lib/siteConfig";

export async function generateMetadata() {
  const site = await siteConfig();
  return {
    title: site.name,
    description: site.tagline,
    icons: site.faviconUrl ? { icon: site.faviconUrl, shortcut: site.faviconUrl } : undefined,
  };
}

// viewportFit: "cover" lets content draw under the iPhone notch/home-indicator
// area instead of Safari letterboxing it away — without this, env(safe-area-
// inset-bottom) always resolves to 0 and the floating cart button's inset
// (Gallery.tsx) can't actually keep clear of the home-indicator bar.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Default fonts loaded app-wide (galleries can override with their own).
const DEFAULT_FONTS = "https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await siteConfig();
  // Explicit cookie choice wins; otherwise fall back to the admin-configured
  // site default (site_settings.theme), then light.
  const cookieTheme = cookies().get("gallery_theme")?.value;
  const theme = cookieTheme === "dark" || cookieTheme === "light" ? cookieTheme : site.theme || "light";
  return (
    <html lang="en-GB" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={DEFAULT_FONTS} rel="stylesheet" />
        {/* Site-wide colour overrides — operator-configurable via SITE_PRIMARY_COLOR / SITE_ACCENT_COLOR. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--brand:${site.primary};--accent:${site.accent};}` }} />
        {/* No-flash: honour saved theme before paint on client navigations. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('gallery_theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
