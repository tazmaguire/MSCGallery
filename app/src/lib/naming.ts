/**
 * Two filenames, two jobs:
 *   - STORED ORIGINAL: "Firstname-IMG_4471.jpg" — what the uploader sends,
 *     prefixed with their first name. Collisions get a short suffix.
 *   - PUBLIC DOWNLOAD:  "MSC2026_Southampton_Sarah_0142.jpg" — clean, sortable,
 *     what everyone downloads.
 * Credit lives in the DB and in the file's IPTC, never only in a filename.
 */
function clean(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "");
}
export function firstName(full: string) {
  return (full || "").trim().split(/\s+/)[0] || "Guest";
}
/** Stored original name: Firstname-originalfilename (sanitised). */
export function storedFilename(full: string, original: string) {
  const fn = clean(firstName(full)) || "Guest";
  const safe = original.replace(/[^\w.\-]/g, "_").slice(-100);
  return `${fn}-${safe}`;
}
/** Public download name. */
export function downloadFilename(o: { shortCode: string; location?: string | null; contributor: string; seq: number; ext: string }) {
  return [clean(o.shortCode), o.location ? clean(o.location) : null, clean(firstName(o.contributor)), String(o.seq).padStart(4, "0")]
    .filter(Boolean).join("_") + "." + o.ext.replace(/^\./, "");
}
