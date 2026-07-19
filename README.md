# Point Radius Gallery

Self-hosted, Pixieset-class event gallery. Gallery-per-event, albums within,
three upload modes (open / PIN / photographer), moderation, full-res free
downloads, per-photographer "Shot by" credit, full branding control.

IONOS VPS + Cloudflare R2. Nothing runs at home. R2 egress is free, so downloads can never generate a surprise bill.
Build verified: `npm run build` compiles clean — 18 routes + middleware.

## Design
Light Bootstrap-style by default, with a global light/dark toggle (remembered per
browser) on every page — admin and public. The turnout-gear reflective stripe is
the signature accent; condensed display type; mono for data. Per gallery you set
colours, accent, intro, terms, and FONTS (curated Google Fonts + a custom-name
escape hatch for display / body / mono). The photo lightbox stays on a neutral
dark backdrop in both themes, as photos read best that way.

## Structure
    db/001_schema.sql        gallery -> album -> asset, three link modes, security tables
    app/src/lib/
      storage.ts             Cloudflare R2 (S3 API). Presigned downloads, private bucket.
      security.ts            rate limit, PIN lockout, IP hashing, audit
      config.ts              boot-time validation (refuses bad config)
      filetype.ts            magic-byte allow-list
      naming.ts              Firstname-filename + clean download names
    app/src/app/g/[slug]/download   streaming zip (store-only, low memory)
    app/src/middleware.ts    security headers (CSP/HSTS/frame-deny)
    worker/                  thumbnails, IPTC credit, web-encode, impostor rejection
    deploy/                  docker-compose, Caddyfile, env.example
    INSTALL.md               step-by-step + security overview

## Security
Boot config validation · per-IP rate limiting · PIN brute-force lockout · magic-
byte file verification · server-derived trust (client can't grant itself access)
· CSP + HSTS + frame-deny · required consent capture · hashed IPs, bcrypt PINs ·
admin audit log · owner/moderator roles.

## The rules
1. media CNAME orange -> free egress.  2. Thumbs on VPS, never B2.
3. Downloads via PUBLIC_CDN_URL only.  4. DB stores keys not URLs.
5. Secrets 24+ chars, enforced at boot.
