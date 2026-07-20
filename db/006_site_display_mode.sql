-- 006 — site_settings.display_mode: how the site identity (logo/name) shows
-- in the admin nav, login page, and public site header — 'logo' (logo only,
-- falls back to name if none uploaded), 'name' (name only, ignores any
-- logo), or 'both' (logo on the left, name after it). Defaults to 'both'.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/006_site_display_mode.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS display_mode text CHECK (display_mode IN ('logo', 'name', 'both') OR display_mode IS NULL);
