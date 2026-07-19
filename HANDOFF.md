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
  src/app/
    g/[slug]/            public gallery (page) + download/ (streaming zip)
    d/[id]/              download redirect → presigned R2 URL (free egress)
    u/[token]/           guest upload page (open / pin modes)
    admin/               list, gallery manager, moderation queue, login
    api/                 upload/presign (THE security boundary), admin/*, auth
  src/components/        Gallery, Uploader, ModerationQueue, GalleryManager,
                         ThemeToggle, AdminNav, GalleryList
  src/middleware.ts      security headers (CSP scoped to self + R2)
  src/instrumentation.ts runs validateConfig() at boot
worker/                  derive (sharp/ffmpeg/exiftool) + purge; reads/writes R2
db/001_schema.sql        11 tables. gallery→album→asset; 3 link modes; security tables
deploy/
  docker-compose.yml     db + app(:8090) + worker. No Caddy.
  env.example            copy to .env, fill in
  nginx/gallery.conf     the host nginx site (reference copy)
  db/                    schema copy auto-loaded by Postgres on first boot
INSTALL-PORTAINER-IONOS.md   original install walkthrough
```

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

Logs:
```
docker compose logs app --tail 50
docker compose logs worker --tail 50
```

---

## Highest-value next tasks (suggested order)

1. **Initialise Git + private remote, push, then set up `git pull`-based deploys
   on the server.** This removes the file-copying that caused most setup pain.
2. **A one-command deploy/update script** (`git pull && docker compose build app
   && docker compose up -d`) with a `--no-cache` flag.
3. **A tiny `public/.gitkeep`** so the Docker `COPY public` step can't fail on a
   clean checkout. (Confirm `app/public/` exists in the repo.)
4. **Replace the placeholder admin account**; consider an audit-log viewer page
   (the `audit_log` table is populated but unsurfaced).
5. **Per-photo delete in admin** (soft-delete → worker purge job already exists in
   the schema/worker; needs an admin control wired to it).
6. **Backups**: Postgres (`pg_dump`) + the `deploy/data/thumbs` dir. R2 holds the
   originals/deliverables already. Nothing is backed up yet.

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
it's almost always because **the R2 bucket has no CORS policy**, so the browser
blocks the request itself before it leaves (a CORS preflight rejection looks
identical to a dropped connection from JS). This bites hardest right after a
storage migration (e.g. B2 → R2) because the CORS policy lives on the bucket, not
in this repo, and a fresh bucket has none.

Fix: apply `deploy/r2-cors.json` to the bucket. Easiest path, Cloudflare
dashboard → R2 → your bucket → Settings → CORS Policy → paste the contents of
that file (edit `AllowedOrigins` to match your actual domain first). Or via the
S3-compatible API if you have `aws` configured with R2 credentials:
```
aws s3api put-bucket-cors --endpoint-url "$S3_ENDPOINT" \
  --bucket "$S3_BUCKET" --cors-configuration file://deploy/r2-cors.json
```
Confirm it's set with `aws s3api get-bucket-cors --endpoint-url "$S3_ENDPOINT" --bucket "$S3_BUCKET"`.

Until this is set, no guest upload can ever complete — which also means nothing
ever reaches the moderation queue (queue requires `status='ready'`, which an
asset only reaches after its bytes actually land in R2). If uploads still fail
after CORS is confirmed correct, check `docker compose logs worker` next —
processing failures also keep assets out of the queue (they never reach `ready`).
