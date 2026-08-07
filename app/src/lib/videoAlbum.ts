import { q } from "./db";

/**
 * Every video upload — guest, photographer link, or admin — lands here
 * instead of wherever it was headed, so videos are never shown on the public
 * site (db/009_video_album.sql). Admins review/download the album's contents
 * and delete them once backed up elsewhere, to keep R2 storage cost down —
 * see the "Videos" album's Access-panel-equivalent in GalleryManager.
 *
 * Lazily created per gallery on first video upload, not at gallery-creation
 * time — most galleries never get one. `ON CONFLICT (gallery_id, slug)` makes
 * this safe under a race between two concurrent first-video uploads.
 */
export async function getOrCreateVideoAlbum(galleryId: string): Promise<string> {
  const [existing] = await q<{ id: string }>(`SELECT id FROM albums WHERE gallery_id=$1 AND is_video_album=true`, [galleryId]);
  if (existing) return existing.id;
  const [row] = await q<{ id: string }>(
    `INSERT INTO albums (gallery_id, name, slug, is_private, is_video_album, sort_order)
     VALUES ($1, 'Videos (admin only)', 'hidden-videos', true, true, 999)
     ON CONFLICT (gallery_id, slug) DO UPDATE SET is_private=true, is_video_album=true
     RETURNING id`,
    [galleryId]);
  return row.id;
}
