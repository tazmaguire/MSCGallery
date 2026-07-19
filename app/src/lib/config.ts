/**
 * Boot-time config validation. Fails loudly at startup with a clear message
 * rather than silently at runtime. Rejects missing or placeholder secrets.
 */
const REQUIRED = [
  "DATABASE_URL", "AUTH_SECRET", "WORKER_SHARED_SECRET",
  "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET", "S3_BUCKET",
];
const WEAK = /^(change_?me|todo|xxx+|placeholder|secret|password)$/i;

export function validateConfig() {
  const problems: string[] = [];
  for (const key of REQUIRED) {
    const v = process.env[key];
    if (!v || !v.trim()) { problems.push(`${key} is missing`); continue; }
    if (WEAK.test(v.trim())) problems.push(`${key} looks like a placeholder — set a real value`);
  }
  for (const key of ["AUTH_SECRET", "WORKER_SHARED_SECRET"]) {
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
