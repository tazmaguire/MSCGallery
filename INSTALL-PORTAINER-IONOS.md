# Setup on IONOS with Portainer (step by step)

> **Superseded for the reverse-proxy step.** This guide deploys a dedicated
> **Caddy** container to terminate TLS, which is right for a VPS with nothing
> else on it. The current production deployment instead shares the VPS with
> other sites behind the **host's own nginx** (no Caddy, app on
> `127.0.0.1:8090`) — see `HANDOFF.md` for that topology. If your VPS is
> dedicated to this app alone, Caddy as below is still a fine choice; if it's
> shared, follow `HANDOFF.md` instead. Everything about R2, DNS, and Portainer
> itself below is still accurate.

This is written to be followed literally, top to bottom, no prior Docker
experience assumed. Storage is **Cloudflare R2** (egress is free — no download
can ever bill you). DNS stays at **GoDaddy** and your live website is never
touched — you add exactly **one** record.

You'll do four things:
1. Cloudflare R2 — make the bucket + keys (~15 min)
2. GoDaddy — add one DNS record (~2 min)
3. IONOS VPS — install Docker + Portainer (~15 min)
4. Portainer — deploy the gallery (~15 min)

Legend: 💻 your computer · 🌐 a web browser · 🖥️ the server (via Portainer or SSH)

Have these open in browser tabs: your Cloudflare dashboard, your GoDaddy domain,
your IONOS control panel.

---

## PART 1 — Cloudflare R2 (storage)

R2 is Cloudflare's object storage. Free egress, 10GB storage free, then about
$0.015/GB/month. You do **not** move your domain to Cloudflare for this — R2 is
separate from DNS.

1. 🌐 Go to **dash.cloudflare.com** → sign up / log in. (A free account is fine.)
2. Left sidebar → **R2**. If prompted, add a payment card — R2 needs one on file
   even on the free tier. **Set a spend alert** while you're there.
3. Click **Create bucket**.
   - Name: `memorial-gallery`
   - Location: **Automatic** (or Europe if offered)
   - Click **Create bucket**.
4. Leave the bucket **private** (the default). The app serves downloads with
   temporary signed links — the bucket never needs to be public.
4.5. **Set the CORS policy** — without this, guest uploads fail instantly with
   a network error, because the browser blocks the direct-to-R2 upload before
   it even leaves. Bucket → **Settings** → **CORS Policy** → paste the
   contents of `deploy/r2-cors.json` from this repo, editing `AllowedOrigins`
   to your actual domain (e.g. `https://gallery.memorialstairclimb.com`) first.
5. Now make an access key. R2 home → **Manage R2 API Tokens** (top-right) →
   **Create API token**.
   - Token name: `gallery-app`
   - Permissions: **Object Read & Write**
   - Specify bucket: **Apply to specific buckets only** → pick `memorial-gallery`
   - TTL: Forever
   - **Create API Token**.
6. Cloudflare shows you three things **once**. Copy all three into a notepad now:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint** — looks like `https://<long-id>.r2.cloudflarestorage.com`
     (also shown on the bucket's **Settings** page as "S3 API").

Keep that notepad open — Part 4 needs those three values.

> Optional but smart: R2 → your bucket → **Settings** → you can't cap egress
> (it's free anyway) but you can watch usage under **Metrics**.

---

## PART 2 — GoDaddy (one DNS record)

This points `gallery.memorialstairclimb.com` at your IONOS server. It does **not**
touch your website, email, shop, or anything else — it only *adds* a brand-new
subdomain.

First, get your server's IP: 🌐 IONOS control panel → your VPS → copy its
**public IPv4 address** (looks like `82.123.45.67`).

Then:
1. 🌐 GoDaddy → **My Products** → your domain → **DNS** → **Manage DNS**.
2. **Add New Record**:
   - Type: **A**
   - Name: `gallery`
   - Value: your IONOS IP address
   - TTL: **1 Hour** (default)
   - **Save**.

That's the only DNS change in this entire guide. Your existing site keeps working.

> DNS can take a few minutes to an hour to spread. You can carry on with Part 3
> meanwhile.

---

## PART 3 — IONOS VPS: install Docker + Portainer

If your IONOS VPS **already has Docker and Portainer**, skip to Part 4.

### 3.1 Point IONOS's firewall the right way
🌐 In the IONOS panel, find your VPS **Firewall Policies** and allow inbound:
**TCP 22** (SSH), **TCP 80** (web), **TCP 443** (secure web), **TCP 9443**
(Portainer's own screen). Save.

### 3.2 Connect to the server
💻 On Windows use **PowerShell**; on Mac use **Terminal**. Type (replace the IP):
```
ssh root@82.123.45.67
```
Say `yes` to the fingerprint question, enter the root password IONOS gave you.
You're now "on" the server — the prompt changes.

### 3.3 Update it and install Docker
🖥️ Paste these one block at a time, pressing Enter after each:
```
apt update && apt upgrade -y
```
```
curl -fsSL https://get.docker.com | sh
```
That second line installs Docker. When it finishes, check it:
```
docker --version
```
You should see a version number.

### 3.4 Install Portainer (the web control panel for Docker)
🖥️ Paste this whole block:
```
docker volume create portainer_data
docker run -d \
  -p 9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```
Wait ~20 seconds.

### 3.5 Open Portainer and set your password
🌐 In your browser go to: `https://82.123.45.67:9443` (your IP, note **https** and
**:9443**). Your browser will warn about the certificate — that's expected for an
IP address. Click **Advanced → Proceed / Continue**.

- Create the admin user: pick a username and a strong password. **Create user.**
- On the next screen choose **Get Started** (manages the local Docker).

You're in Portainer. Leave this tab open.

---

## PART 4 — Deploy the gallery in Portainer

We'll upload the code, then start it as a **Stack** (Portainer's word for a
docker-compose app).

### 4.1 Put the code on the server
The easiest no-fuss way: 💻 from **your own computer's** terminal (not the
server), in the folder that contains the `pr-gallery` folder:
```
scp -r pr-gallery root@82.123.45.67:/root/pr-gallery
```
(Windows PowerShell has `scp` built in. Enter the server password when asked.)

This copies the whole project to `/root/pr-gallery` on the server.

### 4.2 Create the Stack
🌐 In Portainer:
1. Left sidebar → **Stacks** → **Add stack**.
2. Name: `gallery`
3. Build method: choose **Upload** is not what we want here — choose
   **Repository** is not it either — choose the simplest: **Web editor**, but
   instead of pasting, we point it at the file on disk. Easiest reliable route:
   select **Upload**, then **Select file**, and browse to the
   `docker-compose.yml` inside `pr-gallery/deploy/` **on your computer**.

   (If Upload isn't offered in your Portainer version, use **Web editor** and
   paste the contents of `pr-gallery/deploy/docker-compose.yml` into it.)

### 4.3 Fix the build paths
The compose file builds from folders (`./app`, `./worker`). Because the code is
at `/root/pr-gallery`, Portainer needs to build from there. In the stack editor,
find the three `build:` lines and make them absolute:
- `build: ./app`    → `build: /root/pr-gallery/app`
- `build: ./worker` → `build: /root/pr-gallery/worker`

And the volume/Caddyfile/db paths — change the leading `./` to
`/root/pr-gallery/deploy/`:
- `./db:/docker-entrypoint-initdb.d:ro` → `/root/pr-gallery/deploy/db:/docker-entrypoint-initdb.d:ro`
- `./Caddyfile:/etc/caddy/Caddyfile:ro` → `/root/pr-gallery/deploy/Caddyfile:/etc/caddy/Caddyfile:ro`
- `./data/...` paths → `/root/pr-gallery/deploy/data/...` (all of them)

(If this feels fiddly, there's a one-liner alternative at the bottom — "Deploy
from the command line instead.")

### 4.4 Add your settings (environment variables)
Scroll to **Environment variables** in the stack screen → **Add an environment
variable** for each line below. This is where your R2 notepad comes in.

| Name | Value |
|---|---|
| `DB_PASSWORD` | make one up, e.g. a 20-char random string |
| `DATABASE_URL` | `postgresql://gallery:THAT_SAME_PASSWORD@db:5432/gallery` |
| `S3_ENDPOINT` | your R2 endpoint `https://….r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | `memorial-gallery` |
| `S3_ACCESS_KEY` | R2 Access Key ID |
| `S3_SECRET` | R2 Secret Access Key |
| `PUBLIC_SITE_URL` | `https://gallery.memorialstairclimb.com` |
| `AUTH_SECRET` | a 32-char random string (see below) |
| `WORKER_SHARED_SECRET` | a different 32-char random string |
| `THUMB_DIR` | `/app/public/thumbs` |

Need random strings? 🖥️ back in your SSH window run `openssl rand -base64 32`
twice and copy each result.

### 4.5 Point Caddy at your domain
🖥️ In the SSH window:
```
nano /root/pr-gallery/deploy/Caddyfile
```
Change the first line from `gallery.pointradius.co.uk` to
`gallery.memorialstairclimb.com`. Save with **Ctrl+O, Enter**, exit with
**Ctrl+X**.

### 4.6 Deploy
🌐 Back in Portainer, scroll down → **Deploy the stack**. First run pulls images
and builds — **give it 3–5 minutes**. The page will show the stack when it's up.

### 4.7 Watch it come alive
🌐 Portainer → **Containers**. You should see four running: `gallery-db`,
`gallery-app`, `gallery-worker`, `gallery-caddy`.
- If `app` keeps restarting, click it → **Logs**. A boxed **CONFIG ERROR** means
  a setting in 4.4 is missing or wrong — the message names which one. Fix it in
  **Stacks → gallery → Editor**, redeploy.

### 4.8 Get your login
🌐 Portainer → Containers → `gallery-app` → **Console** (the `>_` icon) →
**Connect** (command `/bin/sh`). At the prompt:
```
node scripts/seed.mjs "you@example.com" "Your Name" "a-long-password-12+"
```
That makes your owner account.

### 4.9 Try it
🌐 Visit **https://gallery.memorialstairclimb.com** — Caddy fetches a TLS
certificate automatically the first time (may take 30–60 seconds on first hit),
then the padlock appears. Go to `/admin/login` and sign in.

---

## You're live — do this once

- **Test the full loop:** create a gallery, print the Open QR, upload a photo
  from your phone, approve it in the Queue, publish, download it. The file comes
  straight from R2 (free).
- **Set a spend alert** in Cloudflare (Manage account → Notifications) so storage
  cost can never surprise you. Storage for one event is pennies; egress is free.

---

## When something's off

| What you see | Fix |
|---|---|
| `app` container restarting | its **Logs** show a CONFIG ERROR naming the bad setting |
| Site won't load at the domain | DNS not spread yet (wait), or IONOS firewall missing 80/443 |
| "Your connection isn't private" on first load | normal for ~60s while Caddy gets the cert; refresh |
| Uploads fail instantly | Bucket has no **CORS policy** (most common — see `deploy/r2-cors.json`), or the R2 key lacks **Object Read & Write**, or wrong bucket name |
| Photo uploads but no thumbnail | `worker` **Logs** — usually a wrong R2 value |
| Can't reach Portainer | you need `https://IP:9443` and to click through the cert warning |

---

## Deploy from the command line instead (if Portainer's stack upload annoys you)

Everything Portainer does, these three lines do — and Portainer will still show
and manage the containers afterwards:
```
cd /root/pr-gallery/deploy
cp env.example .env && nano .env      # fill in the same values as 4.4, save
docker compose up -d --build
```
Then seed your account:
```
docker compose exec app node scripts/seed.mjs "you@example.com" "Your Name" "a-long-password"
```
Portainer → Stacks will list it as an external stack you can manage from the UI.

---

## What this costs

- Cloudflare R2 storage: first 10GB free, then ~$0.015/GB/month. One event ≈ tens
  of GB ≈ pennies to under £1/month.
- R2 egress (downloads): **£0, always.** 133 people downloading everything, or
  everyone downloading it ten times — still £0.
- IONOS VPS: what you already pay.
- Domain: unchanged, still at GoDaddy.

Delete a gallery when the event's long past and even the storage pennies stop.
