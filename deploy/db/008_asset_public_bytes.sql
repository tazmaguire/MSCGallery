-- 008 — track deliverable size for storage/cost reporting
--
-- assets.bytes (db/001_schema.sql) is the original uploaded file's size,
-- client-declared at upload time. The worker also writes a re-encoded
-- "public" deliverable to R2 (full-res JPEG / 1080p MP4, see worker/src/index.js
-- derive()) — thumb/preview/poster stay on local disk, not R2, so they don't
-- count towards R2 storage cost, but the public deliverable does. This column
-- lets storage totals (assets.bytes + assets.public_bytes) reflect what's
-- actually billed, not just the original upload size.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/008_asset_public_bytes.sql
-- Idempotent (IF NOT EXISTS), safe to re-run. Existing rows keep public_bytes
-- NULL (treated as 0 in totals) until the next time they're re-derived —
-- no backfill; the size just isn't retroactively knowable without re-deriving.

ALTER TABLE assets ADD COLUMN IF NOT EXISTS public_bytes bigint;
