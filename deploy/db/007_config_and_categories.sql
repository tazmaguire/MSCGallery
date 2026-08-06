-- 007 — encrypted app config + gallery categories/unlisted (v2.0)
--
-- encrypted_settings: storage (R2) credentials + the public domain, editable
-- from /admin/settings without a redeploy. AES-256-GCM, key derived from the
-- ENCRYPTION_KEY env var (generate once at install — see deploy/env.example).
-- Deliberately does NOT hold AUTH_SECRET / WORKER_SHARED_SECRET / the DB
-- password: those are bootstrap secrets the app and worker authenticate
-- *themselves* with — rotating them through a web UI would invalidate every
-- session or desync the worker, so they stay .env-only by design. A row here
-- overrides the matching env var; env vars remain the fallback (and the
-- pre-first-boot bootstrap) exactly like site_settings does for branding.
--
-- gallery_categories / galleries.category_id: free-form admin-defined tags
-- (Sport, Dance, Festival, ...) for grouping galleries on the home page.
-- galleries.is_unlisted: hidden from the home page listing but still
-- reachable by direct link — distinct from is_published, which controls
-- whether the gallery is reachable at all.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/007_config_and_categories.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

CREATE TABLE IF NOT EXISTS encrypted_settings (
  key         text PRIMARY KEY,
  iv          bytea NOT NULL,
  tag         bytea NOT NULL,
  ciphertext  bytea NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES gallery_categories(id) ON DELETE SET NULL;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS is_unlisted boolean NOT NULL DEFAULT false;
