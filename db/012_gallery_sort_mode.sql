-- 012 — persisted, site-wide gallery ordering
--
-- The admin galleries list's sort dropdown used to be purely local — picking
-- "oldest first" only changed what THAT admin saw in THAT browser tab, never
-- what guests saw on the actual site. This makes the choice a real setting:
-- site_settings.gallery_sort_mode, one value for the whole install, read by
-- the public home page and the embed/all + embed/category/[slug] routes as
-- well as the admin list itself. Guests have no control over it anywhere —
-- there was never a guest-facing sort control, and this doesn't add one.
--
-- 'date_asc' | 'date_desc' | 'name_asc' | 'name_desc' | 'custom' (drag order,
-- see db/011_gallery_sort_order.sql). Defaults to 'date_asc' (oldest to
-- newest) when unset, applied in siteConfig.ts, not here — same pattern as
-- display_mode.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/012_gallery_sort_mode.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS gallery_sort_mode text
  CHECK (gallery_sort_mode IN ('date_asc','date_desc','name_asc','name_desc','custom') OR gallery_sort_mode IS NULL);
