import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not defined in the environment variables.');
}
else
{
  console.log("DATABASE_URL is defined in the environment variables.");
}

const sql = neon(databaseUrl);
export const db = drizzle({ client: sql });
