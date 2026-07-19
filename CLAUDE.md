# Point Radius Gallery — notes for Claude Code

**Read `HANDOFF.md` first.** It has the full picture; this is the quick reference.

## What / where
Self-hosted event photo gallery (Next.js 14 App Router + Postgres + Node worker,
storage on Cloudflare R2). **Live** at https://gallery.memorialstairclimb.co.uk on
an IONOS VPS shared with other services behind the host's nginx.

## Non-negotiables (regressions that have bitten before)
- **Read storage/env config LAZILY.** `next build` loads every route with no env
  present; any `process.env.X` read at module import time crashes the Docker build.
  See `app/src/lib/storage.ts` (`function client()`), the reference pattern.
- **Never bind Docker to :80/:443.** Host nginx owns them and serves other live
  sites. The app publishes to `127.0.0.1:8090`; nginx proxies + does TLS.
- **Never commit `deploy/.env` or `deploy/data/`** (secrets + user photos).
- **`api/upload/presign` is the security boundary** — album/moderation/caps come
  from the link token server-side, never the client.
- Storage is **R2** (S3 API). No Backblaze, no `B2_*`, no `PUBLIC_CDN_URL`.

## Build / verify
```
cd app && npm install && npm run build      # must pass with NO app env vars set
node --check worker/src/index.js
```

## Deploy (on the server)
```
./deploy/update.sh            # git pull + build + up
./deploy/update.sh --fresh    # add --fresh if an edit won't take (cache)
```

## Layout
`app/` Next.js · `worker/` image/video processing · `db/001_schema.sql` schema ·
`deploy/` compose + nginx + env.example. Full map in HANDOFF.md.
