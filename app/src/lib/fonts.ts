/**
 * Curated font choices for per-gallery branding.
 *
 * Curated (not "any font") keeps loading fast and pairings intentional, with a
 * free-form escape hatch in the admin for anything on Google Fonts.
 */
export const DISPLAY_FONTS = [
  "Saira Condensed", "Oswald", "Archivo", "Bebas Neue", "Barlow Condensed",
  "Anton", "Playfair Display", "DM Serif Display", "Fraunces", "Space Grotesk",
];
export const BODY_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Source Sans 3", "Work Sans",
  "Nunito Sans", "DM Sans", "Public Sans", "System UI",
];
export const MONO_FONTS = [
  "Space Mono", "JetBrains Mono", "IBM Plex Mono", "Roboto Mono", "DM Mono",
];

const WEIGHTS: Record<string, string> = {
  display: "500;600;700", body: "400;500;600", mono: "400;700",
};

/** Build a single Google Fonts <link> href for the chosen families. */
export function googleFontsHref(fonts: { display?: string; body?: string; mono?: string }): string | null {
  const families: string[] = [];
  const add = (name: string | undefined, role: keyof typeof WEIGHTS) => {
    if (!name || name === "System UI") return;
    families.push(`family=${name.replace(/ /g, "+")}:wght@${WEIGHTS[role]}`);
  };
  add(fonts.display, "display"); add(fonts.body, "body"); add(fonts.mono, "mono");
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function fontStack(name: string | undefined, fallback: string): string {
  if (!name || name === "System UI") return fallback;
  return `'${name}', ${fallback}`;
}
