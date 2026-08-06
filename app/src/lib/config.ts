/**
 * Boot-time config validation. Fails loudly at startup with a clear message
 * rather than silently at runtime. Rejects missing or placeholder secrets.
 *
 * S3_ACCESS_KEY/S3_SECRET/S3_BUCKET are deliberately NOT required here as of
 * db/007_config_and_categories.sql — those can be configured after first boot
 * from /admin/settings instead of being baked into .env, so the app must be
 * able to start (and let an owner log in and configure them) with none of it
 * set. If they ARE set in .env, they're still validated for placeholders
 * below; storage.ts throws its own clear error at call time if nothing is
 * configured anywhere. S3_ENDPOINT stays required: it's stamped into the CSP
 * by middleware.ts, which runs on the Edge runtime and can't read the
 * database-stored override — see the comment in deploy/env.example.
 */
const REQUIRED = ["DATABASE_URL", "AUTH_SECRET", "WORKER_SHARED_SECRET", "ENCRYPTION_KEY", "S3_ENDPOINT"];
const OPTIONAL_IF_SET = ["S3_ACCESS_KEY", "S3_SECRET", "S3_BUCKET"];
const WEAK = /^(change_?me|todo|xxx+|placeholder|secret|password)$/i;

export function validateConfig() {
  const problems: string[] = [];
  for (const key of REQUIRED) {
    const v = process.env[key];
    if (!v || !v.trim()) { problems.push(`${key} is missing`); continue; }
    if (WEAK.test(v.trim())) problems.push(`${key} looks like a placeholder — set a real value`);
  }
  for (const key of OPTIONAL_IF_SET) {
    const v = process.env[key];
    if (v && v.trim() && WEAK.test(v.trim())) problems.push(`${key} looks like a placeholder — set a real value or leave unset`);
  }
  for (const key of ["AUTH_SECRET", "WORKER_SHARED_SECRET", "ENCRYPTION_KEY"]) {
    const v = process.env[key] || "";
    if (v && v.length < 24) problems.push(`${key} is too short — use at least 24 chars (openssl rand -base64 32)`);
  }
  if (process.env.S3_ENDPOINT && !/^https:\/\//.test(process.env.S3_ENDPOINT))
    problems.push("S3_ENDPOINT must start with https://");

  if (problems.length) {
    console.error("\n╔═ CONFIG ERROR ═══════════════════════════════════════");
    for (const p of problems) console.error("║  ✗ " + p);
    console.error("╚══════════════════════════════════════════════════════\n");
    throw new Error("Invalid configuration — see errors above. The app will not start.");
  }
}
