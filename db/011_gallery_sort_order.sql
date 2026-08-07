-- 011 — manual drag-to-reorder for the admin galleries list
--
-- galleries.sort_order: used only when the admin picks "Custom order" in
-- the galleries list sort dropdown (GalleryList.tsx) — date/name sorting
-- there is client-side and ignores this column entirely. Reordering by drag
-- sets it via PATCH /api/admin/galleries { reorder: [id, id, ...] }, index
-- becomes the new sort_order for each.
--
-- NOT auto-applied to an existing DB — see "Database migrations" in
-- HANDOFF.md. Apply by hand, once:
--   docker compose exec -T db psql -U gallery -d gallery < db/011_gallery_sort_order.sql
-- Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE galleries ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
