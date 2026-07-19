import "./globals.css";
import { cookies } from "next/headers";
import { siteConfig } from "@/lib/siteConfig";

export async function generateMetadata() {
  const site = siteConfig();
  return {
    title: site.name,
    description: site.tagline,
    icons: site.faviconUrl ? { icon: site.faviconUrl, shortcut: site.faviconUrl } : undefined,
  };
}

// Default fonts loaded app-wide (galleries can override with their own).
const DEFAULT_FONTS = "https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = cookies().get("gallery_theme")?.value === "dark" ? "dark" : "light";
  const site = siteConfig();
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
