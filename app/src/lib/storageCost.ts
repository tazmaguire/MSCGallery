/**
 * Storage size/cost display helpers for the admin UI.
 *
 * Pricing is Cloudflare R2 standard storage — the only backend this app
 * supports (see HANDOFF.md). Egress is free, so only storage is priced.
 * Update R2_PRICE_PER_GB_MONTH if Cloudflare changes it; there's no API to
 * read it live.
 */
export const R2_PRICE_PER_GB_MONTH = 0.015; // USD
export const R2_FREE_GB_MONTH = 10; // USD billing only kicks in past this, site-wide

const GB = 1024 ** 3;

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

// Flat per-gallery estimate — doesn't apply the free tier, since that's a
// site-wide allowance, not something that can be fairly attributed to one
// gallery. Labelled accordingly wherever it's shown.
export function flatMonthlyCost(bytes: number): number {
  return (bytes / GB) * R2_PRICE_PER_GB_MONTH;
}

// Site-wide estimate — this is what actually gets billed, free tier applied.
export function billedMonthlyCost(totalBytes: number): number {
  const billableGb = Math.max(0, totalBytes / GB - R2_FREE_GB_MONTH);
  return billableGb * R2_PRICE_PER_GB_MONTH;
}

export function formatUSD(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
