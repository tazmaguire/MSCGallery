-- 014 — download activity logs
--
-- Records who downloaded what: a required name, an optional email, which
-- asset (or NULL if the asset was later deleted), and whether it came via
-- the single-photo route or a zip. A zip of N photos logs N rows sharing
-- the same name/email/timestamp — gives real per-photo counts rather than
-- a vague "a zip was downloaded."
--
-- Deliberately its own table rather than reusing audit_log: audit_log is
-- admin/security-event shaped (user_id FK, free-form jsonb detail, no
-- gallery/asset indexing) and not meant to be queried per-gallery the way
-- a "download activity" admin view needs.
--
-- Identity (name/email) is client-supplied and unverified — same trust
-- level as the name a guest types into the uploader. Admin's own downloads
-- via GalleryManager never carry a name and are not logged.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/014_download_logs.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

CREATE TABLE IF NOT EXISTS download_logs (
  id bigserial PRIMARY KEY,
  gallery_id uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  kind text NOT NULL CHECK (kind IN ('single','zip')),
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS download_logs_gallery_idx ON download_logs (gallery_id, created_at DESC);
