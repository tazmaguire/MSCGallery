-- 002 — gallery cover photos + whole-gallery password protection.
--
-- This does NOT auto-apply to an already-running deployment: Postgres only
-- executes files under docker-entrypoint-initdb.d on first cluster init, and
-- production already has data. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/002_customisation.sql
-- (or paste the two statements below into any Postgres client pointed at the
-- production DB). Safe to run more than once — IF NOT EXISTS guards it.

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cover_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS view_password_hash text;
