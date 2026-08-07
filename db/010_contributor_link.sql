-- 010 — optional external link on a contributor's credit
--
-- Lets an admin attach a link (photographer's own site/Instagram/portfolio)
-- to an "official" credit — set from GalleryManager's Edit credit panel, or
-- at pro-upload time. Shown as a small icon next to "SHOT BY <name>" on the
-- public gallery (Gallery.tsx) wherever that name isn't already the
-- click-to-filter target; entirely optional, NULL is the common case
-- (guest contributors never have one).
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/010_contributor_link.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE contributors ADD COLUMN IF NOT EXISTS link_url text;
