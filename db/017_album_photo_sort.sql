-- 017 — per-album public photo order
--
-- Until now the public gallery had exactly one fixed sort for every album
-- in it: newest-first by EXIF capture time (taken_at), falling back to
-- upload time (created_at) when taken_at is missing — which happens often
-- enough for guest phone uploads (stripped EXIF, or many photos landing
-- with the same/no timestamp during a burst) that the result looked
-- effectively random. This makes it a real per-album, admin-chosen setting
-- instead, mirroring the same four-mode scheme GalleryManager's own asset
-- grid already offers the admin locally (date/name, asc/desc) — but this
-- one is persisted and actually governs what public visitors see.
--
-- Defaults to 'date_desc' so every existing album's public order is
-- unchanged until an admin deliberately picks something else.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/017_album_photo_sort.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE albums ADD COLUMN IF NOT EXISTS photo_sort_mode text NOT NULL DEFAULT 'date_desc'
  CHECK (photo_sort_mode IN ('date_asc','date_desc','name_asc','name_desc'));
