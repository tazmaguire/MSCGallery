-- 018 — split per-album photo order into upload-time vs metadata (EXIF)
--
-- db/017 shipped 'date_asc'/'date_desc' as a single blended "date" concept
-- (EXIF taken_at, falling back to upload created_at). Turns out that
-- blending is exactly what made the old fixed order look random in the
-- first place — guest phone uploads routinely have missing/stripped EXIF,
-- so a meaningful chunk of any gallery was always falling back to the
-- upload-time tiebreak anyway. Splitting them into two explicit, honest
-- options (rather than one that silently mixes both) lets an admin pick
-- whichever is actually reliable for a given event.
--
-- Also flips the default to oldest-first (upload_asc) — upload time is
-- never null, so it's the more robust default; taken_at-based ("metadata")
-- sorting can still hit the same missing-EXIF unpredictability db/017 was
-- meant to fix, so it's opt-in rather than the default.
--
-- Existing 'date_asc'/'date_desc' rows (from db/017, if it was ever applied
-- and used) map onto the equivalent upload_* value — upload time was
-- already the practical tiebreak in that blended scheme.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/018_album_photo_sort_by_source.sql
-- Idempotent (the DROP+re-ADD CONSTRAINT pair and remapping UPDATEs are all
-- safe to re-run — a second run just finds nothing left to remap).

ALTER TABLE albums ALTER COLUMN photo_sort_mode DROP DEFAULT;
ALTER TABLE albums DROP CONSTRAINT IF EXISTS albums_photo_sort_mode_check;
UPDATE albums SET photo_sort_mode = 'upload_asc' WHERE photo_sort_mode = 'date_asc';
UPDATE albums SET photo_sort_mode = 'upload_desc' WHERE photo_sort_mode = 'date_desc';
UPDATE albums SET photo_sort_mode = 'upload_asc'
  WHERE photo_sort_mode NOT IN ('upload_asc','upload_desc','metadata_asc','metadata_desc','name_asc','name_desc');
ALTER TABLE albums ADD CONSTRAINT albums_photo_sort_mode_check
  CHECK (photo_sort_mode IN ('upload_asc','upload_desc','metadata_asc','metadata_desc','name_asc','name_desc'));
ALTER TABLE albums ALTER COLUMN photo_sort_mode SET DEFAULT 'upload_asc';
