-- 003 — tagging foundation: bib-number / face-tag groundwork.
--
-- No detection/ML in this migration — just the schema a future OCR/face model
-- plugs into, plus manual tagging and search, which exercise it end to end
-- right away. See worker/src/index.js's detectTags() for the single stub
-- insertion point the eventual model wires into.
--
-- NOT auto-applied to an existing DB (docker-entrypoint-initdb.d only runs on
-- a brand-new empty Postgres volume) — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/003_tagging.sql
-- Idempotent (IF NOT EXISTS throughout), safe to re-run.

CREATE TABLE IF NOT EXISTS asset_tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  -- text+CHECK rather than an enum: this vocabulary will grow (ocr, better
  -- face models, ...) and text is a one-line change, an enum needs its own
  -- migration step per new value.
  tag_type      text NOT NULL CHECK (tag_type IN ('bib', 'face', 'text', 'manual')),
  value         text NOT NULL,                 -- the bib number, or a person/identity label
  confidence    real,                          -- nullable — for future auto-detection
  bbox          jsonb,                         -- nullable — {x,y,w,h} for face/number location
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,  -- who added a manual tag
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_tags_asset_id_idx ON asset_tags (asset_id);
CREATE INDEX IF NOT EXISTS asset_tags_type_value_idx ON asset_tags (tag_type, value);

-- Known-identity stub — the target a future face match (or a manually linked
-- bib) would resolve to. Left mostly unused for now; asset_tags.value works
-- standalone (e.g. bib search) without ever touching this table.
CREATE TABLE IF NOT EXISTS participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  bib           text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS participants_gallery_id_idx ON participants (gallery_id);

-- What a future detection worker still needs to scan. 'skipped' is what the
-- no-op detectTags() stub sets today; a real model would set 'processed'.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS tag_status text NOT NULL DEFAULT 'pending' CHECK (tag_status IN ('pending', 'processed', 'skipped'));
