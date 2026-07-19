-- Gallery — schema
-- GALLERY (event) → ALBUM → ASSET, with three ways to contribute.
--   LINK MODES (upload_links.mode):
--     open         — scan & upload. Name required, email optional. Moderated. Standard caps.
--     pin          — same, but a generic per-gallery PIN gates access. Link can be public.
--     photographer — trusted. Bound to a named contributor, skips moderation, targets any
--                    album, near-unlimited caps. Sent privately, revocable in one click.
-- Rule that must survive edits: store storage KEYS, never URLs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE galleries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  short_code    text NOT NULL,
  event_date    date,
  location      text,
  brand         jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { primary, accent, logo_key, hero_key, intro }
  guest_album_id uuid,
  upload_terms  text,
  max_files_per_session int NOT NULL DEFAULT 100,
  max_session_bytes     bigint NOT NULL DEFAULT 2147483648,
  max_file_bytes        bigint NOT NULL DEFAULT 524288000,
  is_published  boolean NOT NULL DEFAULT false,
  allow_uploads boolean NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE albums (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id     uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  name           text NOT NULL,
  slug           text NOT NULL,
  sort_order     int NOT NULL DEFAULT 0,
  is_private     boolean NOT NULL DEFAULT false,
  is_guest_album boolean NOT NULL DEFAULT false,
  cover_asset_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gallery_id, slug)
);
CREATE INDEX ON albums (gallery_id, sort_order);
CREATE UNIQUE INDEX one_guest_album_per_gallery ON albums (gallery_id) WHERE is_guest_album;
ALTER TABLE galleries ADD CONSTRAINT guest_album_fk FOREIGN KEY (guest_album_id) REFERENCES albums(id) ON DELETE SET NULL;

CREATE TYPE link_mode AS ENUM ('open', 'pin', 'photographer');
CREATE TABLE upload_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id     uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  token          text NOT NULL UNIQUE,
  mode           link_mode NOT NULL,
  pin_hash       text,
  contributor_id uuid,
  target_album_id uuid REFERENCES albums(id) ON DELETE SET NULL,
  max_files_per_session int,
  max_session_bytes     bigint,
  max_file_bytes        bigint,
  label          text,
  is_active      boolean NOT NULL DEFAULT true,
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON upload_links (token);
CREATE INDEX ON upload_links (gallery_id);
ALTER TABLE upload_links ADD CONSTRAINT mode_shape CHECK (
  (mode = 'open') OR (mode = 'pin' AND pin_hash IS NOT NULL) OR (mode = 'photographer' AND contributor_id IS NOT NULL)
);

CREATE TABLE contributors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name  text NOT NULL,
  first_name    text,
  credit_line   text,
  email         text,
  is_guest      boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON contributors (is_guest);

CREATE TYPE asset_kind       AS ENUM ('photo', 'video');
CREATE TYPE asset_source     AS ENUM ('guest', 'photographer', 'admin');
CREATE TYPE asset_visibility AS ENUM ('pending', 'visible', 'rejected');
CREATE TYPE asset_status     AS ENUM ('awaiting_upload', 'uploaded', 'processing', 'ready', 'failed');
CREATE TABLE assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id      uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  album_id        uuid NOT NULL REFERENCES albums(id) ON DELETE RESTRICT,
  contributor_id  uuid NOT NULL REFERENCES contributors(id) ON DELETE RESTRICT,
  kind            asset_kind NOT NULL,
  source          asset_source NOT NULL,
  visibility      asset_visibility NOT NULL DEFAULT 'visible',
  status          asset_status NOT NULL DEFAULT 'awaiting_upload',
  ingest_key      text NOT NULL DEFAULT '',
  thumb_key       text, preview_key text, public_key text, poster_key text,
  original_filename text NOT NULL,
  mime text, bytes bigint, width int, height int, duration_s numeric(10,2),
  checksum text, taken_at timestamptz,
  moderated_at timestamptz, moderated_by uuid, deletion_status text, error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON assets (album_id, visibility, taken_at DESC);
CREATE INDEX ON assets (gallery_id, visibility);
CREATE INDEX ON assets (contributor_id);
CREATE INDEX ON assets (status);
CREATE INDEX ON assets (visibility) WHERE visibility = 'pending';
CREATE UNIQUE INDEX ON assets (gallery_id, checksum) WHERE checksum IS NOT NULL;
ALTER TABLE assets ADD CONSTRAINT visible_needs_public_key CHECK (
  visibility <> 'visible' OR public_key IS NOT NULL OR status <> 'ready'
);
ALTER TABLE albums ADD CONSTRAINT cover_fk FOREIGN KEY (cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL;

CREATE TABLE upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES upload_links(id) ON DELETE CASCADE,
  contributor_id uuid REFERENCES contributors(id) ON DELETE SET NULL,
  ip_hash text, files_count int NOT NULL DEFAULT 0, bytes_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON upload_sessions (link_id);

CREATE TYPE user_role AS ENUM ('owner', 'moderator');
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'moderator', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  bucket_key text PRIMARY KEY, tokens real NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pin_attempts (
  key text PRIMARY KEY, fails int NOT NULL DEFAULT 0, locked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL, detail jsonb, ip_hash text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (created_at DESC);
CREATE INDEX ON audit_log (user_id);

CREATE TYPE job_type AS ENUM ('derive', 'purge');
CREATE TABLE jobs (
  id bigserial PRIMARY KEY, type job_type NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  attempts int NOT NULL DEFAULT 0, last_error text, locked_at timestamptz, locked_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON jobs (locked_at, created_at);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER assets_touch BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
