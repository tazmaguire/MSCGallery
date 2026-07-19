# Install & Security Guide

> **Superseded for deploy mechanics.** This guide describes an earlier
> standalone-VPS + Backblaze B2 + Caddy topology. The current production setup
> is VPS + **Cloudflare R2** + **host nginx** (no Caddy, app on
> `127.0.0.1:8090`) — see `HANDOFF.md` for the accurate architecture and
> `CLAUDE.md` for the deploy loop (`./deploy/update.sh`). The security model,
> upload modes, and "prove it" checklist below are still accurate; only the
> storage backend and reverse-proxy details are stale.

A self-hosted, Pixieset-class event gallery. Gallery-per-event, albums within,
three upload modes, moderation, free full-resolution downloads, per-photographer
credit, full branding control.

Legend: [MAC] your Mac · [WEB] browser · [VPS] the VPS

## The three upload modes

| Mode | Gate | Caps | Moderated | Credit |
|---|---|---|---|---|
| Open | none | 100 files / 2GB | yes | typed first name |
| PIN | generic PIN | 100 files / 2GB | yes | typed first name |
| Photographer | unguessable token | ~5000 / 100GB | no | the named photographer |

- Open — the QR you print or send participants. Scan, name, agree, upload.
- PIN — a public link gated by a PIN you hand out. Brute-force locked.
- Photographer — sent privately to a pro. No moderation, huge caps, credited to
  them, can target any album. Revoke in one click if it leaks.

Every gallery auto-creates an Open link on creation, so the QR works immediately.

## Security — what's built in

Hardened deliberately, not left at "reasonable":

- Boot-time config validation. The app refuses to start if any secret is missing,
  too short, or a leftover CHANGE_ME. Clear list of problems, not a later crash.
- Rate limiting (token-bucket, per hashed IP): uploads throttled; login capped at
  5/min; PIN attempts locked with growing backoff after 5 wrong tries.
- File-type verification. The worker reads magic bytes and rejects anything that
  isn't a genuine image/video; the impostor is deleted from storage.
- Server-derived trust. Album, moderation state, and caps come from the link
  token, never the client. A guest editing the request still lands in the queue.
- Security headers on every response: CSP locked to self + your storage endpoint,
  frame-ancestors none, HSTS, nosniff, referrer policy.
- Consent captured. Required checkbox records agreement to the licence before
  upload — active agreement, not just displayed text.
- No raw IPs or plaintext PINs stored. IPs hashed; PINs bcrypt-hashed.
- Admin audit log: every approve/reject/delete/login recorded.
- Roles: moderators approve/reject (reversible); only owners create galleries and
  destroy things.

## Upload terms (the licence)

Each gallery has editable terms, shown at upload with a required agree checkbox.
Default:

"You keep copyright of any photo or video you upload. By uploading, you grant
Memorial Stair Climb an irrevocable, royalty-free, non-exclusive licence to use,
reproduce, and share your images for promotional, advertising, fundraising, and
archival purposes. You confirm the content is yours to share and that you're
happy for it to appear in the event gallery."

Edit per gallery under Branding. Have your committee approve the final wording —
it's a real licence grant.

## PART 1 — Cloudflare + B2 (done & tested)

You've completed and verified this (cf-cache-status: HIT). For reference it needs:
domain Active on Cloudflare; B2 bucket pointradius-public (Public, eu-central-003);
an app key scoped to it; bucket CORS open to HTTPS origins; media CNAME ->
f003.backblazeb2.com ORANGE; a URL-rewrite rule ((http.host eq
"media.pointradius.co.uk") -> path concat("/file/pointradius-public",
http.request.uri.path)); a cache rule for media. at 1-month edge TTL.

## PART 2 — DNS for the site

[WEB] Cloudflare -> DNS -> Add: A `gallery` -> your VPS IP -> Proxied.

## PART 3 — The VPS

### 3.1 Harden
[MAC]
    ssh root@YOUR-VPS-IP
    apt update && apt upgrade -y
    adduser taz && usermod -aG sudo taz
[MAC] Second terminal — confirm key login BEFORE locking passwords:
    ssh-copy-id taz@YOUR-VPS-IP && ssh taz@YOUR-VPS-IP   # must work
[VPS]
    nano /etc/ssh/sshd_config     # PermitRootLogin no ; PasswordAuthentication no
    systemctl restart ssh
    apt install ufw -y && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

### 3.2 Docker
    curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker taz
Log out, back in.

### 3.3 Code up
[MAC] scp -r pr-gallery taz@YOUR-VPS-IP:~/gallery-src
[VPS]
    mkdir -p ~/gallery && cd ~/gallery
    cp -r ~/gallery-src/app ~/gallery-src/worker ~/gallery-src/db .
    cp ~/gallery-src/deploy/docker-compose.yml ~/gallery-src/deploy/Caddyfile .
    cp ~/gallery-src/deploy/env.example .env && chmod 600 .env

### 3.4 .env
[VPS] nano .env — openssl rand -base64 32 for each secret, paste B2 keys.
Confirm PUBLIC_CDN_URL is your Cloudflare host, NOT the B2 endpoint. The app
refuses to boot if this is wrong, by design.

### 3.5 Caddyfile
[VPS] nano Caddyfile — set your domain.

### 3.6 Launch
[VPS]
    docker compose up -d --build
    docker compose logs -f
Schema self-loads. Worker prints "worker ... up". If config is wrong, the app
prints a boxed CONFIG ERROR and stops — fix .env and retry.
[WEB] https://gallery.pointradius.co.uk loads with a padlock.

### 3.7 Your account
[VPS] docker compose exec app node scripts/seed.mjs "you@example.com" "Taz" "a-long-password"
Sign in at /admin/login.

## PART 4 — Prove it

- [ ] Sign in
- [ ] New gallery (short code MSC2026) — created hidden, with a Guest Photos album
      and an Open link already present
- [ ] Upload links -> see the Open link -> show its QR -> scan on your phone
- [ ] Add name, tick terms, upload a photo -> within ~30s it's in Queue
- [ ] Approve -> move it into an album you make ("Official Photography")
- [ ] Upload links -> create a PIN link -> wrong PIN a few times locks it; right
      PIN uploads
- [ ] Create a Photographer link -> no PIN, no consent gate, uploads appear LIVE
- [ ] Branding -> change colours -> reload gallery, they apply
- [ ] Publish -> open /g/msc-southampton-2026 -> album tiles, "Shot by" captions
- [ ] Download a photo -> MSC2026_Southampton_Sarah_0001.jpg, credit embedded
- [ ] Download album / everything -> zips arrive
- [ ] Upload a non-image renamed .jpg -> rejected, never appears

## When something breaks

| Symptom | Cause |
|---|---|
| App won't start, boxed CONFIG ERROR | a secret is missing/placeholder — message says which |
| Uploads fail instantly ("Couldn't reach storage") | R2 bucket CORS policy missing — see `deploy/r2-cors.json` and `HANDOFF.md` |
| Photo uploads, no thumbnail | `docker compose logs worker` — storage creds or app unreachable |
| "too many attempts" on login | rate limit — wait a minute |

## Running an event

Before: create the gallery; print the Open QR for the day; optionally a PIN link
for a wider public share; send each pro a Photographer link.
During: guest photos hit the queue. Clear on your phone — A approve, R reject.
Pro/photographer photos appear live.
After: sort guest photos into albums. Publish.
Costs: an event's web-sized media is tens of GB. About £0–1/month. Delete a
gallery when done and the purge clears R2 too.

## The rules that keep it cheap and safe

1. R2 egress is free, always -> downloads never bill you.
2. Thumbnails on the VPS, never in R2 -> no extra storage/transaction cost.
3. Downloads via short-lived presigned R2 URLs, never a public bucket URL.
4. DB stores keys, never URLs -> storage swappable in config.
5. Secrets real and 24+ chars -> enforced at boot.
