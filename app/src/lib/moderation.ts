import { q } from "./db";

/**
 * Single source of truth for "what counts as pending moderation." Every page
 * that shows a pending count (the AdminNav badge) or the queue list itself
 * must go through here — having each page hand-roll its own WHERE clause is
 * exactly how the badge and the list silently drifted apart before (the badge
 * query never excluded deleted assets; the list query did).
 *
 * LEFT JOINs (not INNER) on purpose: a pending asset must never vanish from
 * the list just because a join predicate doesn't match — worst case it shows
 * up with a blank credit rather than disappearing outright.
 */
const PENDING_WHERE = `a.visibility='pending' AND a.status='ready' AND (a.deletion_status IS NULL OR a.deletion_status = '')`;

export async function pendingCount(galleryId?: string): Promise<number> {
  const [row] = galleryId
    ? await q<{ n: number }>(`SELECT count(*)::int AS n FROM assets a WHERE ${PENDING_WHERE} AND a.gallery_id=$1`, [galleryId])
    : await q<{ n: number }>(`SELECT count(*)::int AS n FROM assets a WHERE ${PENDING_WHERE}`);
  return row?.n ?? 0;
}

export async function pendingQueue(galleryId?: string) {
  return q(
    `SELECT a.id, a.kind, a.width, a.height, a.bytes, a.thumb_key, a.preview_key, a.poster_key,
            a.album_id, a.gallery_id, a.created_at,
            c.first_name, c.display_name AS contributor_name,
            g.name AS gallery_name, g.slug AS gallery_slug,
            al.name AS album_name
     FROM assets a
     LEFT JOIN contributors c ON c.id = a.contributor_id
     LEFT JOIN galleries g ON g.id = a.gallery_id
     LEFT JOIN albums al ON al.id = a.album_id
     WHERE ${PENDING_WHERE} ${galleryId ? "AND a.gallery_id=$1" : ""}
     ORDER BY a.created_at`,
    galleryId ? [galleryId] : []
  );
}
