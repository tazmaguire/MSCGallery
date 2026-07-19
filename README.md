# Self-hosted event gallery

Self-hosted, Pixieset-class event gallery. Gallery-per-event, albums within,
three upload modes (open / PIN / photographer), moderation, full-res free
downloads, per-photographer "Shot by" credit, a download cart for picking
individual photos, and full branding control — both per-gallery and app-wide.

Runs on any Docker host + Cloudflare R2. R2 egress is free, so downloads can
never generate a surprise bill.

## White-label

The app-wide chrome (title, admin nav, login page, home listing) is
configured entirely through environment variables — see `SITE_NAME`,
`SITE_TAGLINE`, `SITE_LOGO_URL`, `SITE_PRIMARY_COLOR`, `SITE_ACCENT_COLOR` in
`deploy/env.example`. No code changes needed to rebrand a deployment. Each
individual gallery can further override its own colours, logo, intro, terms,
and fonts from the admin UI.

## Design
Light Bootstrap-style by default, with a global light/dark toggle (remembered
per browser) on every page — admin and public. Condensed display type, mono
for data. Per gallery you set colours, accent, intro, terms, and fonts
(curated Google Fonts + a custom-name escape hatch for display / body / mono).
The photo lightbox stays on a neutral dark backdrop in both themes, as photos
read best that way.

## Structure
    db/001_schema.sql        gallery -> album -> asset, three link modes, security tables
    app/src/lib/
      storage.ts             Cloudflare R2 (S3 API). Presigned downloads, private bucket.
      security.ts            rate limit, PIN lockout, IP hashing, audit
      config.ts              boot-time validation (refuses bad config)
      filetype.ts            magic-byte allow-list
      naming.ts              Firstname-filename + clean download names
      siteConfig.ts          app-wide white-label identity (env-driven)
    app/src/app/g/[slug]/download   streaming zip (store-only, low memory); accepts
                                     an album, or a cart selection of asset ids
    app/src/app/admin/account       self-service profile/password management
    app/src/app/admin/users         owner-only user management
    app/src/middleware.ts    security headers (CSP/HSTS/frame-deny)
    worker/                  thumbnails, IPTC credit, web-encode, impostor rejection
    deploy/                  docker-compose, nginx reference config, env.example, r2-cors.json
    INSTALL.md               step-by-step + security overview
    HANDOFF.md                full architecture + operational notes, read this first

## Security
Boot config validation · per-IP rate limiting · PIN brute-force lockout · magic-
byte file verification · server-derived trust (client can't grant itself access)
· CSP + HSTS + frame-deny · required consent capture · hashed IPs, bcrypt PINs ·
admin audit log · owner/moderator roles.

## The rules
1. Storage is Cloudflare R2 — bucket stays private, downloads are presigned.
2. Thumbnails/previews live on the host disk, served by nginx, never through the app.
3. DB stores storage keys, never URLs.
4. Secrets 24+ chars, enforced at boot.
5. The R2 bucket needs a CORS policy for browser uploads to work — see
   `deploy/r2-cors.json` and the troubleshooting section in `HANDOFF.md`.
