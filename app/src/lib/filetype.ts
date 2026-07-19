/**
 * Verify a file is actually what it claims by reading its magic bytes.
 *
 * The browser's Content-Type is a suggestion an attacker fully controls. Before
 * we hand out a presigned upload URL we can't see the bytes yet — but the WORKER
 * checks magic bytes after upload and rejects anything that isn't a real image
 * or video, so a .jpg full of something else never becomes a public deliverable.
 *
 * This module is the allow-list of signatures the worker enforces.
 */
export const SIGNATURES: { ext: string; kind: "photo" | "video"; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg",  kind: "photo", test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png",  kind: "photo", test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "webp", kind: "photo", test: b => b.slice(0,4).toString() === "RIFF" && b.slice(8,12).toString() === "WEBP" },
  { ext: "heic", kind: "photo", test: b => b.slice(4,8).toString() === "ftyp" && /heic|heif|mif1/.test(b.slice(8,12).toString()) },
  { ext: "gif",  kind: "photo", test: b => b.slice(0,3).toString() === "GIF" },
  { ext: "tif",  kind: "photo", test: b => (b[0]===0x49&&b[1]===0x49&&b[2]===0x2a) || (b[0]===0x4d&&b[1]===0x4d&&b[2]===0x00) },
  // RAW formats are TIFF-based or maker-specific; accept common ones by extension fallback in worker
  { ext: "mp4",  kind: "video", test: b => b.slice(4,8).toString() === "ftyp" },
  { ext: "mov",  kind: "video", test: b => b.slice(4,8).toString() === "ftyp" && /qt/.test(b.slice(8,12).toString()) },
  { ext: "webm", kind: "video", test: b => b[0]===0x1a && b[1]===0x45 && b[2]===0xdf && b[3]===0xa3 },
];

export function sniff(head: Buffer): { ext: string; kind: "photo" | "video" } | null {
  for (const s of SIGNATURES) if (s.test(head)) return { ext: s.ext, kind: s.kind };
  return null;
}
