-- 015 — per-link "no size limits" toggle
--
-- Open/PIN links have always inherited the gallery's session caps
-- (max_files_per_session/max_session_bytes/max_file_bytes) uniformly, with
-- no per-link override; photographer links get generous hardcoded defaults
-- (5000 files / 100GB session / 20GB file) unless the gallery's own
-- columns are set on that link row. This adds an explicit boolean so a
-- specific link — any mode — can be switched to fully uncapped without
-- touching the gallery's defaults or every other link in it.
--
-- Also exempts the MIN_PHOTO_BYTES floor in api/upload/presign/route.ts (the
-- "looks like a compressed copy" rejection) — "no limits" means no limits,
-- not every cap except that one.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/015_link_no_limits.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE upload_links ADD COLUMN IF NOT EXISTS no_limits boolean NOT NULL DEFAULT false;
