import { Pool } from "pg";
const g = globalThis as any;
export const db = g._pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") g._pool = db;
export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}
