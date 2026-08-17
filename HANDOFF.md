# Handoff — Self-hosted Event Gallery

This document briefs the next developer (working in Claude Code) to take over a
**live, deployed** self-hosted event photo gallery. Read it fully before touching
anything — there is production state and a few non-obvious constraints.

---

## What this is

A self-hosted, Pixieset-class event gallery for a firefighter charity stair
climb. Guests scan a QR and upload photos; an admin moderates and sorts them into
albums; everyone downloads full-resolution free. Built with Next.js 14
(App Router) + Postgres + a Node worker, storage on Cloudflare R2.

It is **live** at `https://gallery.memorialstairclimb.co.uk`, running on an IONOS
VPS **shared with other services** (a Horilla HR app + another site, both behind
the host's nginx). Do not disrupt those.

---

## ⚠️ FIRST JOB: get this into Git — the repo does not exist yet

The code currently lives as loose files on the server at `/root/pr-gallery` and in
this package. **Several critical fixes were applied directly on the server during
deployment and exist nowhere else.** This package (the one containing this file)
already incorporates them, so treat **this package as the source of truth** and
initialise the repo from it — not from any earlier tarball.

Fixes that must be preserved (all already in this package — verify they're present
before first commit):
1. **`app/src/lib/storage.ts` reads config lazily.** It must NOT call
   `required("S3_ENDPOINT")` at module load — Next.js loads every route during
   `next build`, and eager config throws in Docker where no env exists yet. Look
   for `function client()` / `function bucket()` lazy singletons. If you ever see
   "Missing required env var: S3_ENDPOINT" during `docker build`, this regressed.
2. **`app/src/app/g/[slug]/download/route.ts` uses `getObjectStream()`** from the
   storage lib — not a direct `s3`/`BUCKET` import (those exports no longer exist).
3. **Storage is R2, not Backblaze.** No `B2_*` env vars, no `PUBLIC_CDN_URL`, no
   Cloudflare-proxy download host. Downloads are presigned GETs via `/d/[id]`.
4. **`deploy/docker-compose.yml`** publishes the app to `127.0.0.1:8090` and has
   **no Caddy service** (host nginx terminates TLS). Build contexts are `../app`
   and `../worker` (relative to `deploy/`).

Suggested first commands (in Claude Code, from the project root):
```
git init
git add -A            # .gitignore already excludes .env and data/
git commit -m "Import live production state (R2, lazy storage, nginx deploy)"
# then create a private remote and push
```
**Confirm `.gitignore` is working before the first push** — `git status` must NOT
list `deploy/.env` or anything under `deploy/data/`. Those contain secrets and
user photos and must never be committed.

---

## Architecture (how it actually runs in production)

```
Browser ─▶ host nginx (:443, TLS via certbot)
             │  proxies gallery.memorialstairclimb.co.uk
             ▼
           app  (Docker, 127.0.0.1:8090 → container :3000)  ── Next.js: pages, API, zip stream
             │
             ├─ db      (Docker, Postgres 16, internal only)
             ├─ worker  (Docker, no ports) ── pulls uploads from R2, makes
             │                                 thumb/preview/full-res, writes back
             └─ Cloudflare R2 (S3 API) ── originals + deliverables. Egress FREE.

Thumbnails/previews: written to deploy/data/thumbs on the host, served directly
by nginx at /thumbs/ (NOT through the app, NOT from R2).
```

Key deployment facts:
- **Shared box.** Host nginx already serves `emanager.ukpinkfirefighters.co.uk`
  and `hrm.ukpinkfirefighters.co.uk` (Horilla). The gallery is a *third* nginx
  site: `/etc/nginx/sites-available/gallery.memorialstairclimb.co.uk` (a copy is
  version-controlled at `deploy/nginx/gallery.conf`). Never take ports 80/443 in
  Docker — nginx owns them.
- **`.co.uk` DNS is on GoDaddy nameservers `ns13`/`ns14`.domaincontrol.com**
  (note: NOT ns63/ns64 — that's a different domain). The `gallery` A record →
  the VPS IP. TLS cert via `certbot --nginx`, auto-renews.
- The app image copies `app/public/` — an (essentially empty) `public/` dir must
  exist or the Docker build's `COPY` step fails.

---

## Repo layout

```
app/                     Next.js 14 (App Router, TypeScript)
  src/lib/
    storage.ts           R2 (S3 API). LAZY + async config (DB via secrets.ts
                         overrides S3_* env vars). presign up/down, getObjectStream.
    secrets.ts           encrypted_settings (db/007) — AES-256-GCM, key from
                         ENCRYPTION_KEY. getSecret/setSecret/resolveConfig
                         (DB overrides env, same layering as siteConfig).
                         Never holds AUTH_SECRET/WORKER_SHARED_SECRET/DB
                         password — see the migration's header comment.
    db.ts  auth.ts        pg pool; bcrypt+jose sessions (owner/moderator roles)
    security.ts          per-IP rate limit, PIN lockout, IP hashing, audit log
    config.ts            boot-time env validation (throws on missing/placeholder)
    filetype.ts          magic-byte allow-list (worker rejects impostors)
    naming.ts            storedFilename = Firstname-… ; downloadFilename = MSC2026_…
    fonts.ts             curated Google Fonts lists + href builder (per-gallery)
    siteConfig.ts        app-wide white-label identity — async, DB (site_settings)
                         overrides SITE_* env vars overrides hardcoded defaults
    storageCost.ts       R2 storage size/cost display helpers for /admin —
                         $0.015/GB-month, first 10GB/mo free (site-wide only,
                         not attributed per gallery). Update the rate here if
                         Cloudflare changes it; there's no API to read it live.
    videoAlbum.ts        getOrCreateVideoAlbum() — every video upload lands
                         here instead of the public site, see "Video uploads"
                         below
  src/app/
    g/[slug]/            public gallery (page, password-gated if set) + download/
                         (streaming zip, also password-gated + cart-selection aware,
                         admin-only unless it's a cart selection) + v/[albumSlug]
                         (video showcase album page — see "Video showcase
                         albums" below; also password-gated by the parent
                         gallery, has its own visibility check)
    d/[id]/              download redirect → presigned R2 URL (free egress, also
                         password-gated)
    u/[token]/           guest upload page (open / pin modes)
    embed/               iframe-embeddable views for third-party sites — g/[slug]
                         (single gallery, works even if unlisted, shows a
                         link-out card instead of photos if password-protected),
                         category/[slug] (one category's galleries),
                         all (every published+listed gallery). The ONE place
                         middleware.ts relaxes frame-ancestors — see Guardrails.
    admin/               list, gallery manager, moderation queue (grid +
                         multi-select), login, account (self-service),
                         users (owner-only), settings (owner-only — Site tab:
                         global branding; Storage & domain tab: R2 + PUBLIC_SITE_URL;
                         Embeds tab: generates the <iframe> snippets for embed/*;
                         Updates tab: one-click redeploy, see "Self-update" below)
    api/                 upload/presign (THE security boundary), admin/*, auth,
                         admin/categories (gallery_categories CRUD),
                         admin/settings/storage (encrypted R2/domain config),
                         admin/update (self-update status/trigger — see below),
                         admin/albums/[id]/thumbnail (video showcase album
                         thumbnail upload — local disk, same as branding),
                         internal/storage-config (worker fetches resolved R2
                         creds at startup, worker-secret authenticated),
                         gallery/unlock (gallery password check),
                         gallery/[slug]/search (bib-number search backend —
                         no public UI entry point right now, see below)
  src/components/        Gallery (+ cart, breadcrumb, download-PIN gate,
                         download-identity gate (db/014, name required/email
                         optional, asked once per browser per gallery via
                         localStorage — composes with the PIN gate: identity
                         first, then PIN if required, then the download),
                         right-click/drag-save deterrent, click-to-filter by
                         contributor name — see "Contributor attribution"
                         below), DownloadPinModal, DownloadIdentityModal,
                         Uploader (stage → submit → confirmation; serves all
                         three link modes — open/pin/photographer — the
                         photographer landing used to 404 unconditionally,
                         now shows "Uploading as <name>" and skips the PIN
                         gate + the name/email card (contributor is already
                         bound to the link) — but NOT the consent checkbox,
                         which every mode still requires; per-file Retry on
                         error, and the Submit-more/Go-to-gallery pair is
                         reachable even on a partially-failed batch),
                         PendingNotifier (browser Notification API — see
                         "Admin browser notifications" below), ModerationQueue
                         (grid, multi-select, approve-selected/approve-all,
                         gallery filter tabs), GalleryManager (+ delete/edit/
                         cover/tags/bib search, one consolidated "Settings"
                         button/modal with tabs — Access (password/unlisted/
                         category/download-PIN, db/013), Branding, Upload
                         links, Downloads (db/014, read-only download-activity
                         list) — replacing what used to be three separate
                         top-level buttons each opening its own modal),
                         pro-upload
                         with attribution name+link and a Drive-style
                         per-file progress queue (XHR upload with progress,
                         handles multipart too — admin pro-uploads had no
                         multipart path before, silently no-op'd on anything
                         over the ~100MB single-PUT threshold); asset grid has
                         its own sort (date/name) + select-all/deselect-all +
                         Download-selected, and Edit credit now works on any
                         selection size, not just one (warns if the selection
                         spans more than one existing contributor, since
                         saving renames all of them to the same name/link);
                         rename for the gallery itself and for any album
                         (pencil icon, small RenameModal — the PATCH support
                         already existed on both api/admin/galleries and
                         api/admin/albums, there was just never a UI for it);
                         a Live/Unlisted/Hidden status control right in the
                         header (derived from is_published + is_unlisted,
                         one-click to change either) — previously the only
                         way to change it was the galleries list's Live/Hidden
                         toggle, which never showed or offered Unlisted at all —
                         admin-side tagging UI stays, only the PUBLIC bib
                         search box was pulled; NewAlbumModal now has a
                         Photo album / Video showcase type picker, and an
                         active showcase album swaps the entire photo-grid/
                         bulk-tools panel for ShowcaseAlbumPanel — rename,
                         its own Hidden/Unlisted/Public pill, thumbnail
                         upload, video URL, autoplay, and a CaptionEditor —
                         see "Video showcase albums" below), CaptionEditor
                         (small contentEditable + execCommand Bold/Italic/
                         Link toolbar — deliberately not a full editor
                         library for a 3-command requirement), ThemeToggle, AdminNav (shows
                         the deployed build's git SHA — see below — and now
                         mounts PendingNotifier next to ThemeToggle), GalleryList
                         (sort is a persisted, site-wide setting now —
                         site_settings.gallery_sort_mode, db/012 — read by the
                         public home page + embeds too, not just this admin's
                         browser tab; the PATCH that saves it is now awaited
                         and checked — it used to be fire-and-forget, so a
                         failed save (most commonly db/012 not applied yet)
                         looked fine in the admin dropdown but silently never
                         reached the public site; now shows an inline error
                         instead — includes drag-to-reorder via a "Custom
                         order" mode, native HTML5 DnD off a small grip handle,
                         see db/011_gallery_sort_order.sql — + multi-select +
                         bulk publish/hide/unlist/category — same select-all/
                         bulk-bar pattern as ModerationQueue), GalleryGrid
                         (home page tile grid, reused by embed/all +
                         embed/category/[slug]), SiteHeader, GalleryPasswordGate,
                         AccountForm, UsersManager, SiteSettingsForm,
                         StorageSettingsForm, SettingsTabs, EmbedsForm,
                         UpdatesPanel (polls api/admin/update every 15s — see
                         "Self-update" below)
  src/lib/moderation.ts  single source of truth for pending-queue count/list/
                         galleries — every page reads through this, not its own query
  src/lib/siteIdentity.ts pure display-mode logic (resolveSiteIdentity), split
                         out of siteConfig.ts so client components can import
                         it without pulling in db.ts (pg needs fs/net/tls/dns,
                         which don't bundle for the browser) — client
                         components needing this must import siteIdentity.ts
                         directly, never siteConfig.ts
  src/middleware.ts      security headers (CSP scoped to self + R2)
  src/instrumentation.ts runs validateConfig() at boot
worker/                  derive (sharp/ffmpeg/exiftool) + purge + detectTags
                         stub (see db/003_tagging.sql); reads/writes R2
db/001_schema.sql        11 tables. gallery→album→asset; 3 link modes; security tables
db/002_customisation.sql gallery cover_asset_id + view_password_hash
db/003_tagging.sql       asset_tags, participants stub, assets.tag_status —
                         bib/face-tagging foundation, no ML in this round
db/004_orders_stub.sql   orders + order_items — unused schema stub for a future
                         paid flow; the cart itself is client-side, download-only
db/005_site_settings.sql single-row site_settings — global branding set from
                         /admin/settings (name/tagline/colours/theme/footer/
                         contact + uploaded logo/favicon, stored under the same
                         thumbs path as thumbnails, see below)
db/006_site_display_mode.sql site_settings.display_mode — 'logo' | 'name' | 'both',
                         how the site identity renders in AdminNav, the login
                         page, and the public site header. Defaults to 'both'.
db/007_config_and_categories.sql encrypted_settings (AES-256-GCM R2 creds +
                         domain, see secrets.ts), gallery_categories, and
                         galleries.category_id / is_unlisted.
db/008_asset_public_bytes.sql assets.public_bytes — size of the re-encoded
                         deliverable the worker pushes to R2 (thumb/preview/
                         poster live on local disk, not R2, so they're
                         excluded). Feeds the storage/cost totals in /admin;
                         only backfills for assets re-derived after this
                         migration, not retroactively.
db/009_video_album.sql  albums.is_video_album — marks each gallery's one
                         hidden, admin-only video album (auto-created on
                         first video upload by getOrCreateVideoAlbum(), see
                         src/lib/videoAlbum.ts). Videos are never shown on
                         the public site; see "Video uploads" below.
db/010_contributor_link.sql contributors.link_url — optional external link
                         (photographer's site/Instagram) on an "official"
                         credit, set from GalleryManager's Edit credit panel
                         or at pro-upload time. Shown as a small icon next
                         to "SHOT BY <name>" on the public gallery.
db/011_gallery_sort_order.sql galleries.sort_order — manual drag-to-reorder
                         in the admin galleries list ("Custom order" sort
                         mode). Defaults to 0 for every gallery, so nothing
                         changes on the public home page/embeds until an
                         admin actually drags something; date sorting is the
                         tiebreak either way.
db/012_gallery_sort_mode.sql site_settings.gallery_sort_mode — the galleries
                         list's sort choice, made a real site-wide setting
                         instead of a per-admin, per-tab local one. Read by
                         the public home page + embed/all + embed/category/[slug]
                         (src/lib/gallerySort.ts), not just the admin list.
                         Defaults to 'date_asc' (oldest to newest).
db/013_download_restrictions.sql galleries.download_mode ('open'|'pin') +
                         download_pin_hash — per-gallery download PIN,
                         separate from is_published/is_unlisted. Browsing
                         stays open; only the download action (single photo
                         or zip) is gated. See "Download restrictions" below.
db/014_download_logs.sql download_logs table — one row per asset actually
                         downloaded (name required, email optional,
                         client-supplied and unverified). See "Download
                         logs" below.
db/015_link_no_limits.sql upload_links.no_limits — an explicit per-link
                         override (any mode) that skips the file-size/
                         session caps entirely, beating both the gallery's
                         defaults and photographer mode's hardcoded generous
                         defaults, AND the MIN_PHOTO_BYTES "looks like a
                         compressed copy" floor (originally left un-exempted
                         as a "quality check, not a size restriction" — that
                         distinction wasn't what people actually wanted from
                         a "no limits" toggle, so it's included now too).
                         Toggle lives in GalleryManager's Settings → Upload
                         links tab (a labeled pill per link — "No limits" in
                         green vs "Limited" — plus a checkbox at creation
                         time).
db/016_video_showcase_album.sql albums.is_showcase / is_unlisted / showcase
                         (jsonb) — a video showcase album: a genuinely
                         different album type (not the hidden is_video_album
                         above) holding one curated YouTube/Vimeo embed, an
                         admin-uploaded thumbnail, and a rich-text caption.
                         See "Video showcase albums" below.
                         (all NOT auto-applied to an existing DB, see
                         "Database migrations" below)
deploy/
  docker-compose.yml     db + app(:8090) + worker. No Caddy.
  env.example            copy to .env, fill in
  nginx/gallery.conf     the host nginx site (reference copy)
  db/                    schema copy auto-loaded by Postgres on first boot ONLY —
                         irrelevant for migrations against a live DB, see below
  update-watcher.sh      self-update watcher — runs on the HOST, not in a
                         container. See "Self-update" below.
  msc-gallery-updater.service  systemd unit for the watcher — one-time install
INSTALL-PORTAINER-IONOS.md   original install walkthrough
```

---

## Database migrations

There is no migration framework. `db/00N_*.sql` files under `docker-entrypoint-initdb.d`
(mirrored in `deploy/db/`) only run once, on a brand-new empty Postgres volume
— they do nothing on a database that already has data. Every file after
`001_schema.sql` has to be applied to the live DB by hand, once, after
deploying the code that depends on it:
```
docker compose exec -T db psql -U gallery -d gallery < db/002_customisation.sql
```
Each migration is written with `IF NOT EXISTS` guards so re-running it is safe.

---

## Data model (essentials)

- **gallery** → **albums** → **assets**. One album per gallery is the
  `is_guest_album` (the QR target). Albums can be `is_private` (hidden from public).
- **upload_links**: three `mode`s — `open` (QR, moderated), `pin` (public link +
  bcrypt PIN, brute-force locked, moderated), `photographer` (unguessable token,
  bound to a named contributor, **skips moderation**, high caps, revocable).
  `no_limits` (db/015) is orthogonal to mode — a per-link boolean that skips
  the file-size/session caps entirely for that one link, regardless of mode.
- **assets**: `visibility` pending|visible|rejected; `status` awaiting_upload→
  uploaded→processing→ready|failed. Guest uploads land `pending`; photographer/
  admin land `visible`. Nothing is public until `status='ready'` AND
  `visibility='visible'` AND its album is not private AND gallery `is_published`.
- Storage keys are stored, never URLs — backend stays swappable.
- **site_settings**: singleton (one row, `id boolean PRIMARY KEY DEFAULT true`).
  Global branding, separate from per-gallery `galleries.brand`. Read via
  `siteConfig()` (async — DB row overrides `SITE_*` env vars overrides
  hardcoded defaults), written via `/admin/settings` (owner-only).
- **encrypted_settings**: keyed rows (R2 credentials, `PUBLIC_SITE_URL`), AES-256-GCM
  encrypted with a key derived from `ENCRYPTION_KEY`. Read via `resolveConfig()`
  in `secrets.ts` (DB overrides the matching `S3_*`/`PUBLIC_SITE_URL` env var),
  written via `/admin/settings/storage` (owner-only). Never holds
  `AUTH_SECRET`/`WORKER_SHARED_SECRET`/the DB password — those stay `.env`-only.
- **gallery_categories** + **galleries.category_id**: free-form admin-defined
  tags (Sport, Dance, Festival, …) for grouping galleries on the home page.
  **galleries.is_unlisted**: hidden from the home page listing but still
  reachable by direct link/QR — independent of `is_published`, which is what
  actually gates whether the link works at all.

---

## Public-visibility checklist

The rule: nothing appears, is counted, is downloadable, or can be a cover
photo anywhere public unless `status='ready' AND visibility='visible' AND
album.is_private=false AND gallery.is_published=true` (and `deletion_status`
is null/empty). Re-run this checklist after touching any public route —
verified as of the C audit (this covers every public read surface as of that
audit):

- [x] `app/page.tsx` (home listing) — `is_published` on the gallery query;
      gallery-card cover photo join checks the cover asset's own
      visibility/status/deletion_status (was missing this — fixed).
- [x] `g/[slug]/page.tsx` (gallery + albums) — main asset query has the full
      rule; album photo counts now exclude deleted assets (was missing —
      fixed); album cover and gallery cover joins check the cover asset's own
      visibility/status/deletion_status (was missing — fixed).
- [x] `g/[slug]/download/route.ts` (zip, whole/album/cart-selection) — full
      rule including `public_key IS NOT NULL`; a cart `?id=` list is
      intersected with the same WHERE, so a non-public id is silently
      dropped, never trusted from the client.
- [x] `d/[id]/route.ts` (single-photo download redirect) — full rule inline.
- [x] Gallery-password-gated routes (`g/[slug]/page.tsx`, its `download/`,
      and `d/[id]`) all additionally require `checkGalleryAccess` when
      `view_password_hash` is set — checked independently of the visibility
      rule, not a substitute for it. `d/[id]` and `download/` also require
      `checkDownloadAccess` when `download_mode='pin'` (db/013, admin-bypassed
      same as the view password) — see "Download restrictions" below.
- [x] `api/gallery/[slug]/search/route.ts` (public bib search, added with H)
      — full rule inline, plus the same `checkGalleryAccess` password check;
      degrades to an empty result set (not an error) if `db/003_tagging.sql`
      isn't applied yet.
- Admin routes (`api/admin/*`, `/admin/*`) are intentionally exempt — they
  require `getUser()` and are where pending/private content is *supposed* to
  be visible to logged-in staff.

---

## Contributor attribution + click-to-filter

`contributors.link_url` (db/010_contributor_link.sql) is an optional external
link — a photographer's own site/Instagram — shown as a small icon next to
"SHOT BY <name>" wherever that appears on the public gallery (grid thumbnail
hover pill, lightbox). Set from GalleryManager's Edit credit panel, or
typed alongside the attribution name field next to "Add photos" at pro-upload
time (blank there just means "Official", same default as before this existed).

Clicking the name itself — not the link icon, a separate click target — sets
`Gallery.tsx`'s local `filterContributor` state and narrows the current
album's grid (and lightbox paging) to just that person's photos. This
replaces the always-visible contributor filter chips removed earlier
(R6-1) with an on-demand version: nothing shows until a name is clicked, and
a dedicated pill next to the album title ("Shot by X ✕") is the only way to
clear it — never a second click on the same name, so filter-on and filter-off
are never the same gesture. The filter resets automatically on switching
albums (`useEffect` on `openAlbum`).

The filter matches by **displayed first name**, not `contributor_id`. Guest
uploaders get a fresh `contributors` row per upload *session*
(`api/upload/presign/route.ts` has no name-based dedup, unlike the admin
ingest path) — the client's `sessionId` is only an in-memory `useRef`, so
any page reload starts a new session and a new contributor row for the same
person. Filtering by id would silently miss whatever that person uploaded
in a different session. The accepted tradeoff of name-matching instead: two
genuinely different people sharing a first name get merged in the filtered
view — scoped to a single gallery/album, not a global merge.

---

## Video uploads — accepted, never shown publicly

Guests, photographer links, and admin pro-uploads can all upload video —
it's just never displayed anywhere on the public site. Every video, from any
source, is silently rerouted at upload time into a hidden, admin-only album
(`is_video_album`, one per gallery, auto-created on first video upload by
`getOrCreateVideoAlbum()` in `src/lib/videoAlbum.ts`) instead of wherever it
was actually headed. That album is `is_private=true`, which is what the
public gallery query already excludes — no new visibility logic needed.

The worker also skips the transcode entirely for video (previously its
single most expensive job): no ffmpeg re-encode, no second copy pushed to
R2. `public_key` just points at the original upload, and a cheap poster
frame + thumb are still generated so the admin album grid shows something
recognisable. This is deliberate, not a shortcut — the point is an admin
downloads the album (its "Download album" button, `g/[slug]/download`)
and deletes the originals from R2 once backed up elsewhere, to keep
storage cost down; a re-encoded deliverable nobody will ever stream would
just be waste.

Because `public_key` is the original rather than a generated deliverable,
its extension isn't necessarily `.mp4` — the album zip route derives it from
the actual key, not from `kind`, when serving video (see the comment in
`g/[slug]/download/route.ts`).

Two things that don't apply to this album, enforced in `GalleryManager.tsx`:
videos can't be quick-moved to another album (that would put an unprocessed
original in front of the public), and a video can't be set as an album/gallery
cover image.

The album's Public/Private toggle button is also hidden for it specifically
(shows a static "Always private" instead) — **and that's enforced server-side
too**, `api/admin/albums` PATCH excludes `is_video_album` from any `is_private`
update. A UI-only guard here wouldn't actually protect the guarantee; a
direct API call could still flip it public and expose raw, unprocessed
originals with no re-encoding or credit stamping.

Bulk tools (select-all, download selected/album, delete, edit credit) all
work normally against this album for an authenticated admin — the only
route that needed a change was `g/[slug]/download` (the zip endpoint):
`?id=` selections used to be treated as *always* the public/unauthenticated
cart path, which can never reach a private album by design. It now also
checks `getUser()` on the id-based path — if authenticated, private albums
become reachable for that admin's own selection; an unauthenticated request
is exactly as restricted as before (a guest's cart can only ever contain
ids the public gallery actually rendered, which never includes a private
album, so this doesn't open anything up for them). The same route also used
to reject an admin's Download all/selected on a password-protected gallery
unless they separately held the public password-gate cookie — admins are
already authenticated via session, so that check is skipped for them now.

---

## Video showcase albums

**Not the same thing as the section above.** `is_video_album` (db/009) is a
hidden, always-private dumping ground for raw guest-uploaded video
originals — nobody's meant to see it. A video showcase album
(`albums.is_showcase`, db/016_video_showcase_album.sql) is the opposite:
curated, admin-authored, and explicitly meant to be public — one embedded
YouTube/Vimeo video (v1; direct upload deferred — see below), an
admin-uploaded thumbnail, and a short rich-text caption, presented as its
own full-page item in a gallery's album list instead of a photo grid. Point
is to host the video but drive traffic to view it on the gallery site
rather than going straight to YouTube/Vimeo.

- **Data**: `albums.is_showcase` / `is_unlisted` are real columns (queried
  in `WHERE`); `albums.showcase` (jsonb) bundles `{videoSource, videoUrl,
  autoplay, captionHtml, thumbKey}` — same "loosely-related config in one
  jsonb bag" convention as `galleries.brand`. No unique-per-gallery index —
  unlike the singular hidden video album, a gallery can have several
  showcase albums. `is_unlisted` mirrors `galleries.is_unlisted` exactly:
  combined with `is_private`, gives the same Hidden/Unlisted/Public
  tri-state already used for whole galleries, just scoped to one album.
- **v1 is embed-only, deliberately** — a directly-uploaded video meant for
  public playback would need a *real* transcode (H.264/AAC, faststart) to
  play reliably everywhere, which the worker doesn't do today (see "Video
  uploads" above: it deliberately skips re-encoding entirely, because
  output was never meant to be public). Embeds sidestep that whole problem.
  `src/lib/videoEmbed.ts`'s `parseVideoUrl()`/`embedSrc()` handle both
  YouTube and Vimeo URL shapes, re-validated server-side in `api/admin/
  albums` PATCH — never trust the client's own parsing.
- **Its own route, not client-side state**: `g/[slug]/v/[albumSlug]/page.tsx`
  — necessary because "Unlisted" only means anything if there's a real URL
  to reach it by. Same gallery-level password gate as the main gallery page
  (`checkGalleryAccess`/`GalleryPasswordGate`); `is_private=true` 404s the
  route entirely; `is_unlisted` doesn't gate the route at all (that's the
  point — direct link still works), it only excludes the album from the
  `g/[slug]` grid-listing query.
- **The public "All albums" grid**: showcase albums have zero real `assets`
  rows (embed-only), so the existing "hide albums with no visible photos"
  filter in `g/[slug]/page.tsx` explicitly exempts `is_showcase` albums —
  otherwise they'd never appear at all. Their tile uses `showcase.thumbKey`
  as the cover and links to `/g/[slug]/v/[slug]` via a real `<Link>`, not
  `Gallery.tsx`'s usual `setOpenAlbum` client-state toggle.
- **First HTML-rendering surface in this app** — `captionHtml` is the only
  admin-supplied field ever rendered via `dangerouslySetInnerHTML` anywhere
  in this codebase. Sanitized with `sanitize-html` (allowlist: `b, strong,
  i, em, a, br, p` only) **on write**, in `api/admin/albums` PATCH — the
  public page trusts the stored value and re-sanitizing on every read isn't
  needed as long as that PATCH handler stays the only write path. If you
  ever add another way to set `showcase.captionHtml`, sanitize there too.
- **CSP**: no `frame-src` directive existed before this feature — every
  cross-origin iframe was already blocked outright by the `default-src`
  fallback. `middleware.ts` now allows `https://www.youtube-nocookie.com`
  and `https://player.vimeo.com`, scoped narrowly to the `/g/*/v/*` path
  only (regex on `req.nextUrl.pathname`), same discipline as the existing
  `/embed/*` `frame-ancestors` relaxation right next to it.
- **Autoplay is always muted** (`?autoplay=1&mute=1` / `&muted=1`) — no
  browser allows unmuted autoplay; visitors can unmute once it's playing.
  The admin-facing autoplay checkbox says so.
- **Thumbnail storage**: `api/admin/albums/[id]/thumbnail` mirrors the
  branding logo/favicon upload (`api/admin/settings/upload`) exactly — same
  local-disk `THUMB_DIR` convention every thumbnail in this app already
  uses (never R2), no server-side resize (the app container has no
  image-processing library; that's the worker's job).
- **Admin panel**: `NewAlbumModal` gets a Photo album / Video showcase type
  picker at creation. An active showcase album swaps `GalleryManager`'s
  entire photo-grid/bulk-tools block for `ShowcaseAlbumPanel` — rename, its
  own Hidden/Unlisted/Public pill, thumbnail upload, video URL, autoplay,
  `CaptionEditor` — **deliberately no download link and no bulk-select
  tools**, since there's no per-photo asset grid to operate on at all.

---

## Download restrictions

`galleries.download_mode` (db/013_download_restrictions.sql) is a **separate
concept from `is_published`/`is_unlisted`**, which control who can *browse*.
This only gates the *download* action — a single photo (`/d/[id]`) or a zip
(`g/[slug]/download`) — while browsing stays completely open. Mirrors the
existing view-password architecture (`galleries.view_password_hash`,
`checkGalleryAccess`) rather than inventing a new one: `download_pin_hash`
(bcrypt), `checkDownloadAccess`/`downloadAccessToken` in `security.ts`, and
a `dp_<galleryId>` cookie set by `api/gallery/download-unlock`, paralleling
`gv_<galleryId>` from `api/gallery/unlock`.

Both download routes check it with an admin bypass (`getUser()`), same
pattern as their existing view-password check. Set from `GalleryManager`'s
Access modal, in a visually separate "Download protection" section — not
folded into the Live/Unlisted/Hidden status control, since it's an
independent axis.

Like `gv_<id>`, the `dp_<id>` cookie is a **non-revocable 30-day HMAC
token** — rotating a gallery's PIN does not invalidate a visitor who already
unlocked downloads for the rest of that 30 days. Same accepted gap the view
password already has; worth remembering since "PIN required" reads as
tighter control than the cookie model strictly delivers on rotation.

The right-click/drag-save block on grid thumbnails and the lightbox
(`onContextMenu` → a toast, `draggable={false}`) is a **cosmetic deterrent,
not the security boundary** — grid/lightbox images are already lower-res
`thumb`/`preview` tiers, never the full-resolution file. The PIN gate on
`/d/[id]` and the zip route is what actually protects the full-res
deliverable.

---

## Download logs

`download_logs` (db/014_download_logs.sql) records who downloaded what: a
required name, an optional email, which asset, and `kind` ('single'|'zip').
Identity is captured client-side by `DownloadIdentityModal` (`Gallery.tsx`),
composing with the download-PIN gate above via the same "stash the pending
action in a ref, show a modal, resume on success" pattern — identity is
asked first (once per browser per gallery, persisted in `localStorage` under
`dlIdentity:<slug>`, same convention as the cart), then the PIN gate if the
gallery requires one, then the actual download. **Nothing here is verified
server-side** — the name/email are exactly as trustworthy as the name a
guest types into `Uploader.tsx`, sent as plain `dlname`/`dlemail` query
params on the actual download request (both existing download triggers are
GET navigations already, so this is just string-building, not a new request
mechanism or a cookie).

Both `/d/[id]/route.ts` and `g/[slug]/download/route.ts` write through
`logDownload()` (`security.ts`) — best-effort, wrapped in try/catch, so a
missing migration or any insert failure never blocks or slows the actual
download. A zip logs one row per asset it actually contains (not one vague
"N items" row), sharing the same name/email/timestamp.

**Admin downloads are never logged.** GalleryManager's own "Download
all"/"Download selected" links go straight to the download routes without
ever passing through `Gallery.tsx`'s identity gate, so they carry no
`dlname` — the routes treat a missing `dlname` as "don't log this one."

Viewable per-gallery in GalleryManager's Settings modal → Downloads tab
(read-only, `api/admin/galleries/[id]/download-logs`, latest 200 rows,
degrades to an empty list rather than an error if `db/014` isn't applied
yet — same convention as every other not-yet-migrated case in this app).

---

## Admin browser notifications

`PendingNotifier` (mounted in `AdminNav.tsx` next to `ThemeToggle`) polls
`api/admin/pending-count` (a thin wrapper around the existing
`pendingCount()` in `lib/moderation.ts`) every 60s and fires a browser
`Notification` when the site-wide pending total increases during the
session — seeded from the page's initial server-rendered count, so a fresh
page load never itself fires a notification for pre-existing pending items,
only a genuine new arrival does. Clicking the notification focuses the tab
and navigates to `/admin/queue`.

Permission is requested from a real click on the bell icon (`Notification.
requestPermission()` needs a user gesture; there is no on-load auto-prompt).
Polling only runs once permission is `"granted"` — if it's `"denied"` or
never granted, the bell shows a muted/disabled state and nothing polls.

This is deliberately just page-open, foreground-tab notifications — no
service worker, no push subscription, nothing persisted beyond what the
browser already persists (`Notification.permission` itself). If a real
push-notification system (works with the tab/browser closed) is ever
wanted, that's a materially bigger addition — VAPID keys, a subscription
table, a service worker — not an extension of this component.

---

## Self-update

`/admin/settings/updates` (owner-only) lets you pull the latest code and
redeploy from a button in the browser instead of SSH + `./deploy/update.sh`.
It needs a one-time install on the server before it does anything.

**Why it's not just "give the app container Docker access."** The obvious
implementation — mount `/var/run/docker.sock` into the `app` container, add
`git`/`docker` to its image, run `git pull && docker compose build && up` as
a child process from an API route — would work, but it means the
public-facing web app has root-equivalent control over the entire Docker
host. If the app is ever compromised through any bug, that's a full host
takeover, not just this app. The `app` container is deliberately minimal and
runs as an unprivileged user (see the Dockerfile's own comments) — punching
a Docker-socket hole in that for convenience isn't worth it.

**What's actually built instead** — a host-side watcher:

- `deploy/update-watcher.sh` runs continuously on the HOST as root (never in
  a container), started via `deploy/msc-gallery-updater.service` (systemd).
  Every 30s it `git fetch`es and writes what it finds (latest commit, how
  many commits behind) to `deploy/data/update/status.json`.
- That same directory is bind-mounted **read-write** into the `app`
  container at `/app/update-state` (`docker-compose.yml`) — but the app can
  only ever create an empty `request` file there (`api/admin/update`'s POST
  handler) and read `status.json`/`update.log` (its GET handler, surfaced by
  `UpdatesPanel.tsx`). It has no git, no Docker CLI, no socket, nothing that
  executes anything.
- The watcher is the only thing that ever turns `request`'s existence into
  `git pull && docker compose build --build-arg GIT_SHA=... app worker &&
  docker compose up -d` — the exact same sequence `deploy/update.sh` already
  ran manually. **If the app container is ever compromised, the blast radius
  is "can flip one file's existence," not "controls the host."**
- `docker-entrypoint.sh` chowns `/app/update-state` to the `app` user at
  container boot, same fix as the thumbs directory below it (a bind mount
  arrives root-owned on a fresh checkout otherwise).

**One-time install** (as root, from the repo root on the server):
```
ln -s $(pwd)/deploy/msc-gallery-updater.service /etc/systemd/system/msc-gallery-updater.service
systemctl daemon-reload
systemctl enable --now msc-gallery-updater.service
systemctl status msc-gallery-updater.service   # confirm it's running
```
The unit assumes the repo lives at `/root/pr-gallery` (the documented install
path) — edit `WorkingDirectory`/`ExecStart` in the `.service` file first if
yours doesn't. After this, `/admin/settings/updates` shows "up to date" or
"N commits behind" (checked every 30s by the watcher, polled every 15s by
the page) and the "Update now" button actually does something; before
installing it, the page says so and tells you to fall back to SSH.

**Known limitation**: updating rebuilds and restarts the `app`/`worker`
containers, which briefly takes the site offline (same as running
`update.sh` manually always has) — `UpdatesPanel` says so in its copy. Not a
zero-downtime deploy; this project doesn't have one.

---

## The deploy loop (how to ship a change)

There is no CI yet. If the self-update watcher (above) is installed,
`/admin/settings/updates` → "Update now" does all of this for you. Manually:
```
# on the server, in /root/pr-gallery
git pull                                   # once the repo + remote exist
cd deploy
docker compose build app                   # or: build --no-cache app  (see gotcha)
docker compose up -d
```
**Cache gotcha:** Docker's layer cache keys off `COPY . .`; if a source edit
doesn't seem to take effect, the build silently reused a cached layer. Force it:
`docker compose build --no-cache app`. This bit us repeatedly during setup.

**Before reporting "this UI still shows the old thing" as a bug:** check the
build version in the admin nav (top-right, small `v<sha>` text) against
`git log --oneline -1` on the server. If they don't match, it's a deploy
lag/cache issue, not a code bug — run `./deploy/update.sh --fresh`. This has
already burned a full round of back-and-forth once (a UI element reported
"still present" three times turned out to already be removed in every commit
— the live container just hadn't rebuilt). `deploy/update.sh` now stamps
each build with the git short SHA (`--build-arg GIT_SHA`) specifically so
this is a 5-second check instead of a re-diagnosis.

Seed an admin user:
```
docker compose exec app node scripts/seed.mjs "email" "Name" "password-12+chars"
```
(An account was seeded during setup with placeholder creds — **replace it**.)

**Removing the placeholder account:** `/admin/users` (owner-only) lists every
admin user and can create/delete them — no shell access needed after the
first login. To retire the seeded placeholder: log in as it once, go to Users
→ New user, create your real owner account, log out, log back in as the real
account, then Users → Remove on the placeholder. (You can't delete your own
account while logged in as it, and the last remaining owner can't be deleted
at all — both guard against locking yourself out.)

Logs:
```
docker compose logs app --tail 50
docker compose logs worker --tail 50
```

---

## Highest-value next tasks (suggested order)

1. ~~Initialise Git + `git pull`-based deploys~~ — done, this repo.
2. ~~One-command deploy/update script~~ — done, `deploy/update.sh`.
3. ~~`public/.gitkeep`~~ — present.
4. **Replace the placeholder admin account**; consider an audit-log viewer page
   (the `audit_log` table is populated but unsurfaced).
5. ~~Per-photo delete in admin~~ — done: select photos in the gallery manager →
   Delete (owner-only). Sets `deletion_status='pending'` (hides immediately) and
   enqueues the existing worker `purge` job.
6. **Backups**: Postgres (`pg_dump`) + the `deploy/data/thumbs` dir. R2 holds the
   originals/deliverables already. Nothing is backed up yet.
7. **Apply `db/002_customisation.sql`** to the live DB (see "Database
   migrations" above) to turn on gallery cover photos and whole-gallery
   password protection — the code for both shipped already but degrades to
   "feature off" until the columns exist.

---

## Guardrails — do not regress these

- **Never eager-load storage config** (see First Job #1).
- **Never bind Docker to :80/:443** — host nginx owns them; other live sites share
  this box.
- **Never give the `app` container Docker socket, git, or SSH access** to make
  self-update "simpler." The whole point of `deploy/update-watcher.sh` running
  on the host instead is that the public-facing container can only flip one
  file's existence, never execute anything — see "Self-update" for the full
  rationale. If a future change needs the app to trigger more than "please
  update," extend the watcher's protocol (another sentinel file, another
  field in status.json), don't give the container itself more access.
- **`albums.showcase.captionHtml` must only ever be written through
  `api/admin/albums`'s PATCH handler**, which runs it through `sanitize-html`
  before it touches the database. It's the only admin-supplied HTML this
  app renders anywhere (`dangerouslySetInnerHTML` on the public showcase
  page trusts the stored value completely, no re-sanitizing on read). Any
  new code path that can set this field needs the same sanitization, not a
  copy-paste of the raw value.
- **The CSP `frame-src` allowance for YouTube/Vimeo is scoped to `/g/*/v/*`
  only** (`middleware.ts`, a pathname regex right next to the existing
  `/embed/*` `frame-ancestors` exemption). Don't widen it to a blanket
  allowance — every other route still blocks all cross-origin iframes via
  the `default-src` fallback, which is deliberate.
- **Every internal link INTO a showcase album page must be a plain `<a>`,
  never `next/link`.** CSP headers are only applied when the browser loads
  a fresh document — a Next.js client-side `<Link>` transition keeps
  enforcing the *previous* page's CSP (which has no `frame-src` for
  YouTube/Vimeo, since that's scoped to this one route), so the embed gets
  blocked with "This content is blocked" until the next full reload. Bit us
  once already: the album-grid tile in `Gallery.tsx` used `<Link>` at
  first, and worked on refresh but never on the first click. Any future
  entry point into `/g/[slug]/v/[albumSlug]` needs the same plain-`<a>`
  treatment, not just that one tile.
- **Never commit `deploy/.env` or `deploy/data/`.**
- **The upload presign route (`api/upload/presign`) is the security boundary** —
  album, moderation state, and caps are derived server-side from the link token,
  never trusted from the client. Keep it that way.
- **R2 egress is free; keep downloads on presigned R2 URLs / `/d/[id]`**, not
  proxied through the app (which would spend VPS bandwidth) — except the zip route,
  which necessarily streams through the app.
- **Whole-gallery/whole-album zip downloads are admin-only** (`g/[slug]/download`
  without `?id=` requires `getUser()`). A **cart selection** (`?id=` params) stays
  public — that's the only bulk-download path for non-admins. Don't relax the
  gate on the no-`id` branch; if you add a new "download all" entry point,
  point it at the admin gallery manager, not the public gallery page.
- The zip route skips a bad/missing R2 key per-item rather than aborting the
  whole archive (one stale object shouldn't 502 an entire cart download) — keep
  that per-item try/catch if you touch `g/[slug]/download/route.ts`.
- **The download-PIN check (`download_mode`) on `g/[slug]/download/route.ts`
  and `d/[id]/route.ts` is admin-bypassed** (`getUser()`), same as the
  view-password check — don't accidentally relax it the other way and start
  blocking admins, or tighten it and start requiring the PIN twice for staff
  who are already authenticated.
- The worker verifies **magic bytes** and rejects/deletes impostor files. Keep
  that check.
- **Don't add `USER app` back to `app/Dockerfile`.** `/app/public/thumbs` is
  bind-mounted from `deploy/data/thumbs` (nginx needs direct host access to
  serve thumbs) — a bind mount replaces the image's baked-in ownership with
  whatever the host directory actually has, which is root on a fresh checkout.
  `docker-entrypoint.sh` fixes ownership as root at container start, then
  drops to the `app` user before exec'ing the real process. Removing that
  reintroduces the `EACCES: mkdir '/app/public/thumbs/thumb'` outage.
- **`S3_ENDPOINT` must stay in `.env`, even though the other R2 fields don't
  have to.** `middleware.ts` stamps it into the CSP on every response and runs
  on Next's Edge runtime, which can't reach Postgres or decrypt
  `encrypted_settings` — it only ever sees `process.env`. An owner can change
  the endpoint from `/admin/settings`, but if `S3_ENDPOINT` in `.env` doesn't
  match, uploads silently CSP-block in the browser exactly like an R2 CORS
  mismatch does. `config.ts` still requires it at boot for this reason.
- **The worker doesn't have `ENCRYPTION_KEY` and can't read `encrypted_settings`
  itself.** It fetches resolved R2 credentials from the app's
  `/api/internal/storage-config` once at startup (worker-secret authenticated,
  falls back to its own `S3_*` env vars if that fails). A storage change made
  in `/admin/settings` needs `docker compose restart worker` to reach the
  worker — it isn't picked up live like it is for the app.
- **`siteConfig.ts` imports `db.ts` (pg) — never import it from a `"use client"`
  component**, even for a type or a pure helper. Webpack bundles the whole
  module graph for the browser, and `pg` needs Node-only builtins (`fs`,
  `net`, `tls`, `dns`) that don't exist client-side, breaking `next build`
  with "Module not found". Client components needing the logo/name
  display-mode logic import `src/lib/siteIdentity.ts` instead — a
  db-free module `siteConfig.ts` re-exports from for server-side callers.
- **`frame-ancestors 'none'` / `X-Frame-Options: DENY` is site-wide except
  `/embed/*`** (`middleware.ts`), which sets `frame-ancestors *` and omits XFO
  entirely so it can be dropped into a third-party page's `<iframe>` — that's
  the whole point of the embed routes. If you ever add a new route under
  `/embed/`, it inherits this automatically from the path prefix; don't widen
  the exemption to any other path, and don't add anything under `/embed/`
  that exposes non-public data (it's unauthenticated by design, same
  visibility rules as the public gallery routes).
- **A `catch` block's fallback query needs its own `try/catch` too.** Found
  in `api/admin/categories` POST: the catch handled "duplicate name" by
  falling back to a `SELECT` for the existing row — but on a DB that hasn't
  had `db/007` applied at all, `gallery_categories` doesn't exist, so that
  fallback `SELECT` threw too, uncaught, producing a 500 with no JSON body.
  The client's `.catch(() => ({}))` swallowed the parse failure and showed a
  generic "Couldn't add that category" with zero diagnostic value — looked
  exactly like a real code bug from the outside. Any "try the happy path,
  fall back to X on failure" pattern needs X itself guarded, or a missing
  migration downgrades from "clear 409 with the migration name in it" to
  "silent, undiagnosable failure."

---

## Known rough edges

- No automated tests. Verification is `npm run build` + manual click-through.
- No CI/CD; deploys are manual (see loop above).
- `next.config.mjs` sets `output: "standalone"` and
  `experimental.instrumentationHook` (needed for boot-time config validation on
  Next 14.2).
- The build must pass with **zero app env vars present** (that's the Docker build
  condition). If you add a new module that reads `process.env.X` at import time,
  you'll reintroduce the build crash — read env lazily inside functions instead.

---

## Thumbnails 403 (or just broken images everywhere)

Root cause: this repo lives at `/root/pr-gallery` on the server, and the old
thumbs bind mount (`deploy/data/thumbs`) resolved to
`/root/pr-gallery/deploy/data/thumbs`. `/root` is `0700` — root-only — so
host nginx (running as an unprivileged user, e.g. `www-data`) can't
**traverse into** `/root` to reach anything below it, no matter what the
thumbs directory or files themselves are chmod'd to. Every `/thumbs/`
request 403s. This is a directory-location problem, not a permissions-on-the-
files problem — do **not** chmod `/root` itself open to "fix" it.

Fixed by moving the bind mount to `/srv/msc-thumbs` — `docker-compose.yml`
and `deploy/nginx/gallery.conf` now both point there. `/srv` is a normal
top-level directory nginx can already reach. `docker-entrypoint.sh` still
does the uid-100 chown from the A2 fix, plus `chmod -R a+rX` (ownership alone
isn't enough here — nginx runs as a *different* user than the app container,
so the tree needs to be world-readable, not just app-owned).

**This needs a one-time manual step on the server** — moving the code alone
doesn't move the existing files, and I don't have server access to do this
part myself:
```
mkdir -p /srv/msc-thumbs
cp -a /root/pr-gallery/deploy/data/thumbs/. /srv/msc-thumbs/
chown -R 100:101 /srv/msc-thumbs
chmod -R a+rX /srv/msc-thumbs
```
Then edit the **live** nginx site (not just this repo's reference copy) —
`/etc/nginx/sites-available/gallery.memorialstairclimb.co.uk` — to match the
new `deploy/nginx/gallery.conf` (both the `/thumbs/` alias and its nested
`preview` alias point at `/srv/msc-thumbs/`), then:
```
nginx -t && systemctl reload nginx
```
Verify with `curl -I https://gallery.memorialstairclimb.co.uk/thumbs/thumb/<some-id>.webp`
— should be `200`, not `403`. Once confirmed, the old
`/root/pr-gallery/deploy/data/thumbs` copy can be deleted; nothing reads from
there anymore after `./deploy/update.sh` picks up the compose change.

---

## Site branding storage — reuses the thumbs path, not R2

Uploaded logo/favicon (`/admin/settings`) are written under `THUMB_DIR/branding/`
(the same root as thumbnails — `/app/public/thumbs` in the container,
`/srv/msc-thumbs` on the host) and served by the *existing* nginx `/thumbs/`
location at `/thumbs/branding/<file>`. Deliberately **not** R2, and
deliberately **not** a new bind mount / nginx location: it's small,
rarely-changed, app-identity data (not per-event photo content), and reusing
the path that's already fixed for uid-100 + world-readable access means zero
new infra to get wrong. If you ever add another kind of site-wide upload,
follow the same pattern rather than introducing a third storage path.

---

## Verifying a deploy actually landed

The admin nav bar, shown on every `/admin/*` page (top-right, small `v<sha>`
text, desktop only), shows the git short SHA baked into the running container — `deploy/update.sh` now passes
`--build-arg GIT_SHA=$(git rev-parse --short HEAD)` to `docker compose build`.
Compare it against `git log --oneline -1` on the server before concluding a
"fix didn't work" is a real regression rather than a stale build — a UI
element reported "still present" three rounds in a row turned out to be
removed in every one of those commits; the live container just hadn't
rebuilt each time. `./deploy/update.sh --fresh` forces a clean rebuild if the
SHA doesn't match.

---

## If uploads fail instantly ("Couldn't reach storage")

The browser uploads straight to R2 via a presigned PUT (`Uploader.tsx` → `put()`).
If that XHR fails with no response at all — not a 4xx/5xx, literally no response —
the browser blocked the request itself before it left. Two independent causes
produce the identical symptom; check both.

**1. CSP `connect-src` / addressing-style mismatch (fixed in code, but only from
this point forward).** `storage.ts`'s `S3Client` didn't set `forcePathStyle`, so
the AWS SDK defaulted to virtual-hosted-style URLs
(`https://<bucket>.<account>.r2.cloudflarestorage.com/...`) — a different origin
than `S3_ENDPOINT` itself. `middleware.ts`'s CSP `connect-src` only allow-lists
`S3_ENDPOINT` verbatim, so the browser silently blocked every upload PUT as a
CSP violation (indistinguishable from CORS/network failure client-side — no
response, `onerror` fires). Fixed by forcing path-style addressing (same fix in
`worker/src/index.js` for consistency, though the worker isn't browser-side so
CSP never applied to it). **This needed a code deploy, not a Cloudflare setting**
— redeploy after pulling this fix.

**2. R2 bucket has no CORS policy.** Separate from #1 — even with addressing
fixed, the browser still needs the bucket's CORS policy to allow the PUT.
Cloudflare dashboard → R2 → your bucket → Settings → CORS Policy → paste
`deploy/r2-cors.json` (edit `AllowedOrigins` to your actual domain first). Or:
```
aws s3api put-bucket-cors --endpoint-url "$S3_ENDPOINT" \
  --bucket "$S3_BUCKET" --cors-configuration file://deploy/r2-cors.json
```
Confirm with `aws s3api get-bucket-cors --endpoint-url "$S3_ENDPOINT" --bucket "$S3_BUCKET"`.

Until both are right, no guest upload can ever complete — which also means
nothing ever reaches the moderation queue (queue requires `status='ready'`,
which an asset only reaches after its bytes actually land in R2). Asset rows
from failed attempts get created (visible as a placeholder in admin, stuck at
`status='awaiting_upload'`) but never go further — harmless clutter, safe to
ignore or delete. If uploads still fail after both are confirmed correct, check
`docker compose logs worker` next — processing failures also keep assets out
of the queue (they never reach `ready`).
