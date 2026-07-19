/**
 * Worker — runs on the VPS now (no home box).
 *
 * DERIVE: pull original from B2, make thumb (600) + preview (2048) on the VPS
 * disk, stamp IPTC credit, make the downloadable full-res deliverable, push that
 * back to B2. Video: poster + 720p web copy.
 *
 * PURGE: remove an asset's bytes from B2 and the VPS, then drop the row.
 *
 * Photos are light. The only real load is video transcoding — but phone clips
 * from an event are short, and if a queue builds during a busy hour the only
 * symptom is thumbnails appearing a few minutes late. Nothing breaks.
 */

import pg from "pg";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { exiftool } from "exiftool-vendored";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const exec = promisify(execFile);

// Magic-byte allow-list. The browser's content-type is attacker-controlled; we
// verify the real bytes here and refuse anything that isn't a genuine image or
// video before it can ever become a public deliverable.
const SIGS = [
  { ext: "jpg",  kind: "photo", t: b => b[0]===0xff&&b[1]===0xd8&&b[2]===0xff },
  { ext: "png",  kind: "photo", t: b => b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47 },
  { ext: "webp", kind: "photo", t: b => b.slice(0,4).toString()==="RIFF"&&b.slice(8,12).toString()==="WEBP" },
  { ext: "heic", kind: "photo", t: b => b.slice(4,8).toString()==="ftyp"&&/heic|heif|mif1/.test(b.slice(8,12).toString()) },
  { ext: "gif",  kind: "photo", t: b => b.slice(0,3).toString()==="GIF" },
  { ext: "tif",  kind: "photo", t: b => (b[0]===0x49&&b[1]===0x49&&b[2]===0x2a)||(b[0]===0x4d&&b[1]===0x4d&&b[2]===0x00) },
  { ext: "mp4",  kind: "video", t: b => b.slice(4,8).toString()==="ftyp" },
  { ext: "webm", kind: "video", t: b => b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3 },
];
const RAW_RE = /\.(cr2|cr3|nef|arw|dng|raf|orf)$/i;
function sniff(head, filename) {
  for (const s of SIGS) if (s.t(head)) return s;
  if (RAW_RE.test(filename)) return { ext: "raw", kind: "photo", t: () => true }; // RAW verified by decode step
  return null;
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

const cfg = {
  db: process.env.DATABASE_URL,
  bucket: process.env.S3_BUCKET,
  vpsUrl: process.env.SELF_URL || "http://app:3000",
  secret: process.env.WORKER_SHARED_SECRET,
  sizes: { thumb: 600, preview: 2048 },
  concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
  pollMs: 4000,
  id: `w-${crypto.randomBytes(3).toString("hex")}`,
};

const db = new pg.Pool({ connectionString: cfg.db, max: 4 });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET },
});

async function pull(key, dest) {
  const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  await pipeline(r.Body, createWriteStream(dest));
}
async function pushDerivative(kind, key, buf, ct) {
  const r = await fetch(`${cfg.vpsUrl}/api/internal/derivative`, {
    method: "POST",
    headers: { "content-type": ct, "x-worker-secret": cfg.secret, "x-derivative-kind": kind, "x-derivative-key": key },
    body: buf,
  });
  if (!r.ok) throw new Error(`VPS rejected ${kind}: ${r.status}`);
}
async function stamp(file, credit) {
  await exiftool.write(file, {
    Artist: credit.name, Creator: credit.name, "By-line": credit.name,
    Credit: credit.name, CopyrightNotice: credit.copyright, Copyright: credit.copyright, Rights: credit.copyright,
  }, { writeArgs: ["-overwrite_original"] });
}

async function derive(a, dir) {
  const orig = path.join(dir, "original");
  await pull(a.ingest_key, orig);

  // Verify the real bytes match a known image/video signature. Reject impostors.
  const head = await readFile(orig).then(b => b.subarray(0, 64));
  const detected = sniff(head, a.original_filename);
  if (!detected || detected.kind !== a.kind) {
    await db.query(`UPDATE assets SET status='failed', visibility='rejected', error=$2 WHERE id=$1`,
      [a.id, `Rejected: file is not a valid ${a.kind} (declared ${a.mime || "?"})`]);
    // remove the impostor from B2 so we don't store or serve it
    try { await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: a.ingest_key })); } catch {}
    log(`REJECTED impostor ${a.id} (${a.original_filename})`);
    return;
  }

  const h = crypto.createHash("sha256"); h.update(await readFile(orig));
  const checksum = h.digest("hex");
  const credit = {
    name: a.credit_name,
    copyright: `© ${new Date(a.event_date || Date.now()).getFullYear()} ${a.credit_name}. ${a.gallery_name}.`,
  };
  const m = { checksum };

  if (a.kind === "photo") {
    let src = orig;
    if (/\.(cr2|cr3|nef|arw|dng|raf|orf)$/i.test(a.original_filename)) {
      const tiff = path.join(dir, "d.tiff");
      try { await exec("dcraw_emu", ["-w", "-T", "-o", tiff, orig]); src = tiff; }
      catch { try { src = await exiftool.extractPreview(orig, path.join(dir, "p.jpg")); } catch {} }
    }
    const meta = await sharp(src, { failOn: "none" }).metadata();
    m.width = meta.width; m.height = meta.height;
    try { const t = await exiftool.read(orig); const dt = t.DateTimeOriginal || t.CreateDate; if (dt) m.taken_at = new Date(dt.toString()).toISOString(); } catch {}

    const thumb = await sharp(src, { failOn: "none" }).rotate()
      .resize(cfg.sizes.thumb, cfg.sizes.thumb, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    const previewFile = path.join(dir, "preview.webp");
    await sharp(src, { failOn: "none" }).rotate()
      .resize(cfg.sizes.preview, cfg.sizes.preview, { fit: "inside", withoutEnlargement: true })
      .sharpen({ sigma: 0.6 }).webp({ quality: 82 }).toFile(previewFile);
    await stamp(previewFile, credit);

    // Full-res downloadable deliverable → B2
    const pub = path.join(dir, "public.jpg");
    await sharp(orig, { failOn: "none" }).rotate().jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(pub);
    await stamp(pub, credit);
    const publicKey = `pub/${a.id.slice(0, 2)}/${a.id}.jpg`;
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: publicKey, Body: await readFile(pub),
      ContentType: "image/jpeg", CacheControl: "public, max-age=31536000, immutable" }));

    await pushDerivative("thumb", `${a.id}.webp`, thumb, "image/webp");
    await pushDerivative("preview", `${a.id}.webp`, await readFile(previewFile), "image/webp");
    m.thumb_key = m.preview_key = `${a.id}.webp`; m.public_key = publicKey;
  } else {
    const probe = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration", "-of", "json", orig]);
    const p = JSON.parse(probe.stdout);
    m.width = p.streams?.[0]?.width; m.height = p.streams?.[0]?.height;
    m.duration_s = Number(p.format?.duration || 0).toFixed(2);

    const poster = path.join(dir, "poster.jpg");
    await exec("ffmpeg", ["-y", "-ss", "1", "-i", orig, "-frames:v", "1", "-q:v", "3", poster]);
    const thumb = await sharp(poster).resize(cfg.sizes.thumb, cfg.sizes.thumb, { fit: "inside" }).webp({ quality: 78 }).toBuffer();
    const posterBuf = await sharp(poster).resize(cfg.sizes.preview, cfg.sizes.preview, { fit: "inside" }).webp({ quality: 80 }).toBuffer();

    const pub = path.join(dir, "public.mp4");
    await exec("ffmpeg", ["-y", "-i", orig, "-vf", "scale='min(1920,iw)':-2",
      "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart", "-metadata", `artist=${credit.name}`, "-metadata", `copyright=${credit.copyright}`, pub]);
    const publicKey = `pub/${a.id.slice(0, 2)}/${a.id}.mp4`;
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: publicKey, Body: await readFile(pub),
      ContentType: "video/mp4", CacheControl: "public, max-age=31536000, immutable" }));

    await pushDerivative("thumb", `${a.id}.webp`, thumb, "image/webp");
    await pushDerivative("poster", `${a.id}.webp`, posterBuf, "image/webp");
    m.thumb_key = m.poster_key = `${a.id}.webp`; m.public_key = publicKey;
  }

  await db.query(
    `UPDATE assets SET status='ready', checksum=$2, width=$3, height=$4, duration_s=$5,
       taken_at=COALESCE($6::timestamptz, taken_at, created_at),
       thumb_key=$7, preview_key=$8, poster_key=$9, public_key=$10, error=NULL WHERE id=$1`,
    [a.id, m.checksum, m.width ?? null, m.height ?? null, m.duration_s ?? null, m.taken_at ?? null,
     m.thumb_key ?? null, m.preview_key ?? null, m.poster_key ?? null, m.public_key]);
  log(`derived ${a.kind} ${a.id}`);
}

async function purge(a) {
  for (const key of [a.ingest_key, a.public_key].filter(Boolean)) {
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    try { await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key })); throw new Error("still there"); } catch (e) { if (e.message === "still there") throw e; }
  }
  await fetch(`${cfg.vpsUrl}/api/internal/derivative`, {
    method: "DELETE", headers: { "x-worker-secret": cfg.secret, "content-type": "application/json" },
    body: JSON.stringify({ keys: [a.thumb_key, a.preview_key, a.poster_key].filter(Boolean) }),
  });
  await db.query(`DELETE FROM assets WHERE id=$1`, [a.id]);
  log(`purged ${a.id}`);
}

async function claim() {
  const { rows } = await db.query(
    `UPDATE jobs SET locked_at=now(), locked_by=$1, attempts=attempts+1
     WHERE id=(SELECT id FROM jobs WHERE (locked_at IS NULL OR locked_at < now()-interval '30 min')
       AND attempts<5 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [cfg.id]);
  if (!rows[0]) return null;
  const job = rows[0];
  const { rows: a } = await db.query(
    `SELECT a.*, COALESCE(c.credit_line,c.display_name) AS credit_name,
       g.name AS gallery_name, g.event_date FROM assets a
     JOIN contributors c ON c.id=a.contributor_id JOIN galleries g ON g.id=a.gallery_id WHERE a.id=$1`, [job.asset_id]);
  return a[0] ? { job, asset: a[0] } : { job, asset: null };
}

async function runOne() {
  const c = await claim();
  if (!c) return false;
  const { job, asset } = c;
  if (!asset) { await db.query(`DELETE FROM jobs WHERE id=$1`, [job.id]); return true; }
  const dir = await mkdtemp(path.join(tmpdir(), "prg-"));
  try {
    if (job.type === "derive") { await db.query(`UPDATE assets SET status='processing' WHERE id=$1`, [asset.id]); await derive(asset, dir); }
    else if (job.type === "purge") await purge(asset);
    await db.query(`DELETE FROM jobs WHERE id=$1`, [job.id]);
  } catch (e) {
    log(`FAIL job ${job.id}:`, e.message);
    await db.query(`UPDATE jobs SET locked_at=NULL, last_error=$2 WHERE id=$1`, [job.id, String(e.message).slice(0, 500)]);
    await db.query(`UPDATE assets SET status='failed', error=$2 WHERE id=$1`, [asset.id, String(e.message).slice(0, 500)]);
  } finally { await rm(dir, { recursive: true, force: true }); }
  return true;
}

async function loop() { for (;;) { try { if (!(await runOne())) await new Promise(r => setTimeout(r, cfg.pollMs)); } catch (e) { log("loop:", e.message); await new Promise(r => setTimeout(r, cfg.pollMs)); } } }
log(`worker ${cfg.id} up, concurrency ${cfg.concurrency}`);
for (let i = 0; i < cfg.concurrency; i++) loop();
process.on("SIGTERM", async () => { await exiftool.end(); await db.end(); process.exit(0); });
