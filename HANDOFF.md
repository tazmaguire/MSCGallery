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
    storage.ts           R2 (S3 API). LAZY config. presign up/down, getObjectStream.
    db.ts  auth.ts        pg pool; bcrypt+jose sessions (owner/moderator roles)
    security.ts          per-IP rate limit, PIN lockout, IP hashing, audit log
    config.ts            boot-time env validation (throws on missing/placeholder)
    filetype.ts          magic-byte allow-list (worker rejects impostors)
    naming.ts            storedFilename = Firstname-… ; downloadFilename = MSC2026_…
    fonts.ts             curated Google Fonts lists + href builder (per-gallery)
    siteConfig.ts        app-wide white-label identity (SITE_* env vars, lazy)
  src/app/
    g/[slug]/            public gallery (page, password-gated if set) + download/
                         (streaming zip, also password-gated + cart-selection aware)
    d/[id]/              download redirect → presigned R2 URL (free egress, also
                         password-gated)
    u/[token]/           guest upload page (open / pin modes)
    admin/               list, gallery manager, moderation queue, login,
                         account (self-service), users (owner-only)
    api/                 upload/presign (THE security boundary), admin/*, auth,
                         gallery/unlock (gallery password check)
  src/components/        Gallery (+ cart, breadcrumb), Uploader (stage → submit),
                         ModerationQueue, GalleryManager (+ delete/edit/cover),
                         ThemeToggle, AdminNav, GalleryList, SiteHeader,
                         GalleryPasswordGate, AccountForm, UsersManager
  src/middleware.ts      security headers (CSP scoped to self + R2)
  src/instrumentation.ts runs validateConfig() at boot
worker/                  derive (sharp/ffmpeg/exiftool) + purge; reads/writes R2
db/001_schema.sql        11 tables. gallery→album→asset; 3 link modes; security tables
db/002_customisation.sql gallery cover_asset_id + view_password_hash — NOT auto-applied
                         to an existing DB, see "Database migrations" below
deploy/
  docker-compose.yml     db + app(:8090) + worker. No Caddy.
  env.example            copy to .env, fill in
  nginx/gallery.conf     the host nginx site (reference copy)
  db/                    schema copy auto-loaded by Postgres on first boot ONLY —
                         irrelevant for migrations against a live DB, see below
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
- **assets**: `visibility` pending|visible|rejected; `status` awaiting_upload→
  uploaded→processing→ready|failed. Guest uploads land `pending`; photographer/
  admin land `visible`. Nothing is public until `status='ready'` AND
  `visibility='visible'` AND its album is not private AND gallery `is_published`.
- Storage keys are stored, never URLs — backend stays swappable.

---

## The deploy loop (how to ship a change)

There is no CI yet. To deploy after a code change:
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
- **Never commit `deploy/.env` or `deploy/data/`.**
- **The upload presign route (`api/upload/presign`) is the security boundary** —
  album, moderation state, and caps are derived server-side from the link token,
  never trusted from the client. Keep it that way.
- **R2 egress is free; keep downloads on presigned R2 URLs / `/d/[id]`**, not
  proxied through the app (which would spend VPS bandwidth) — except the zip route,
  which necessarily streams through the app.
- The worker verifies **magic bytes** and rejects/deletes impostor files. Keep
  that check.
- **Don't add `USER app` back to `app/Dockerfile`.** `/app/public/thumbs` is
  bind-mounted from `deploy/data/thumbs` (nginx needs direct host access to
  serve thumbs) — a bind mount replaces the image's baked-in ownership with
  whatever the host directory actually has, which is root on a fresh checkout.
  `docker-entrypoint.sh` fixes ownership as root at container start, then
  drops to the `app` user before exec'ing the real process. Removing that
  reintroduces the `EACCES: mkdir '/app/public/thumbs/thumb'` outage.

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
