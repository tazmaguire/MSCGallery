-- 009 — hidden video album
--
-- Video uploads (guest, photographer link, or admin) are never shown on the
-- public site — they're routed automatically into a per-gallery, admin-only
-- album (is_private=true) instead of wherever they'd otherwise land, so an
-- admin can review/download the originals and delete them once backed up,
-- without a video ever reaching a public gallery page. See getOrCreateVideoAlbum()
-- in src/lib/videoAlbum.ts, used by api/upload/presign and api/admin/ingest.
--
-- is_video_album marks that album unambiguously (rather than matching on
-- name/slug, which an admin could rename) — same pattern as is_guest_album.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/009_video_album.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE albums ADD COLUMN IF NOT EXISTS is_video_album boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS one_video_album_per_gallery ON albums (gallery_id) WHERE is_video_album;
