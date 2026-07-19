import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const usesSsl =
    isProduction ||
    connectionString.includes('supabase') ||
    connectionString.includes('render.com') ||
    process.env.DATABASE_SSL === 'true';

  return {
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.DB_CONN_TIMEOUT_MS || 10_000),
    ssl: usesSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
