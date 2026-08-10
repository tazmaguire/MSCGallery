-- 013 — per-gallery download restrictions
--
-- Separate from is_published/is_unlisted (which control who can BROWSE a
-- gallery). This controls who can DOWNLOAD from it: a single photo (/d/[id])
-- or a zip (g/[slug]/download). 'open' (default) is today's behavior —
-- anything a visitor can view they can also download. 'pin' keeps browsing
-- completely open but requires a gallery-specific PIN before any download
-- action succeeds. Mirrors the existing view-password pattern
-- (galleries.view_password_hash) rather than inventing a new one.
--
-- No DB-level "pin mode requires a hash" constraint — Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS, and view_password_hash has never had one
-- either. Enforced application-side in the admin PATCH handler instead.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/013_download_restrictions.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS download_mode text NOT NULL DEFAULT 'open' CHECK (download_mode IN ('open','pin'));
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS download_pin_hash text;
