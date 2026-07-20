-- 005 — global (whole-install) site settings, separate from per-gallery
-- branding (galleries.brand jsonb, unaffected). A single-row table: `id
-- boolean PRIMARY KEY DEFAULT true CHECK (id)` is a standard Postgres trick
-- that makes a second row impossible (the only legal PK value is `true`).
--
-- Uploaded logo/favicon are stored on disk under the SAME path/permissions
-- as thumbnails (deploy/data/thumbs or /srv/msc-thumbs, whichever this
-- install already uses — see docker-entrypoint.sh), just in a "branding/"
-- subdirectory, and served by the same nginx /thumbs/ location. No new
-- bind mount or nginx location needed — deliberately reusing the
-- already-fixed uid-100 + world-readable path rather than introducing a
-- second one. Not R2: this is small, rarely-changed, app-identity data,
-- not per-event photo content.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/005_site_settings.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

CREATE TABLE IF NOT EXISTS site_settings (
  id             boolean PRIMARY KEY DEFAULT true CHECK (id),
  name           text,                  -- falls back to SITE_NAME env, then "Gallery"
  tagline        text,
  logo_key       text,                  -- e.g. "branding/logo-<ts>.webp", served at /thumbs/<logo_key>
  favicon_key    text,
  primary_color  text,
  accent_color   text,
  theme          text CHECK (theme IN ('light', 'dark') OR theme IS NULL),
  footer_text    text,
  contact_email  text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
