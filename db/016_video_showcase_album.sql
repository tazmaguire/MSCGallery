-- 016 — video showcase albums
--
-- A genuinely different album type from a photo album: holds one embedded
-- YouTube/Vimeo video (v1 — direct upload deferred, would need a real
-- transcoding pipeline the worker doesn't have today), an admin-uploaded
-- thumbnail, and a rich-text caption. Not the same thing as the existing
-- is_video_album (db/009) — that's an unrelated, always-private dumping
-- ground for raw guest-uploaded video originals; this is curated,
-- admin-authored, and meant to be public.
--
-- is_showcase / is_unlisted are real columns (queried in WHERE clauses).
-- is_unlisted mirrors galleries.is_unlisted (db/007) exactly: combined with
-- the existing is_private, gives the same Hidden/Unlisted/Public tri-state
-- already used for whole galleries — hidden=is_private,
-- unlisted=!is_private AND is_unlisted, public=!is_private AND !is_unlisted.
-- No unique-per-gallery index — unlike the singular hidden video album,
-- multiple showcase albums per gallery are fine.
--
-- showcase bundles the rest ({videoSource, videoUrl, autoplay, captionHtml,
-- thumbKey}) — same "loosely-related config in one jsonb bag" convention as
-- galleries.brand, keeping this ALTER small and avoiding sparse columns on
-- the vast majority of albums that are ordinary photo albums.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/016_video_showcase_album.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE albums ADD COLUMN IF NOT EXISTS is_showcase boolean NOT NULL DEFAULT false;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS is_unlisted boolean NOT NULL DEFAULT false;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS showcase jsonb;
