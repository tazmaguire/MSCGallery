-- 004 — orders/order_items schema stub.
--
-- Foundation only, for a future PAID download/print flow. Nothing writes to
-- these tables yet: the cart shipped in this round is entirely client-side
-- (localStorage, download-only, no payment) — see g/[slug]/download/route.ts,
-- which zips a cart selection without ever touching this table. This just
-- documents where that future flow would attach, so it doesn't need its own
-- migration later.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/004_orders_stub.sql
-- Idempotent (IF NOT EXISTS throughout), safe to re-run.

CREATE TABLE IF NOT EXISTS orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id  uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'download' CHECK (status IN ('download', 'pending_payment', 'paid', 'fulfilled', 'cancelled')),
  contact     jsonb,          -- nullable — e.g. { email, name } once checkout exists
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_gallery_id_idx ON orders (gallery_id);

CREATE TABLE IF NOT EXISTS order_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
