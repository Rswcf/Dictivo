import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = config.DATABASE_URL
  ? new Pool({
      connectionString: config.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000
    })
  : null;

export async function query<T = unknown>(sql: string, values: unknown[] = []): Promise<T[]> {
  if (!pool) return [];
  const result = await pool.query(sql, values);
  return result.rows as T[];
}

export async function closePool() {
  await pool?.end();
}
