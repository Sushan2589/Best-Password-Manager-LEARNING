import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in the environment variables.');
}

let sql: ReturnType<typeof neon>;
try {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  sql = neon(databaseUrl);
} catch { throw new Error("Database configuration is invalid."); }
export const db = drizzle({ client: sql });
