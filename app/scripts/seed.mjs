import pg from "pg"; import bcrypt from "bcryptjs";
const [email, name, password] = process.argv.slice(2);
if (!email || !name || !password) { console.error('Usage: node scripts/seed.mjs "email" "Name" "password"'); process.exit(1); }
if (password.length < 12) { console.error("Password must be 12+ characters."); process.exit(1); }
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await db.query(`INSERT INTO users (email,password_hash,display_name,role) VALUES ($1,$2,$3,'owner') ON CONFLICT (email) DO UPDATE SET password_hash=$2, role='owner'`, [email, await bcrypt.hash(password, 12), name]);
console.log(`Owner created: ${email}`); await db.end();
