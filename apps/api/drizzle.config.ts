import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});


/*
  You can directly apply changes to your database using the drizzle-kit push command. This is a convenient method for quickly testing new schema designs or modifications in a local development environment, allowing for rapid iterations without the need to manage migration files:

npx drizzle-kit push

Read more about the push command in documentation.

Tips
Alternatively, you can generate migrations using the drizzle-kit generate command and then apply them using the drizzle-kit migrate command:

Generate migrations:

npx drizzle-kit generate

Apply migrations:

npx drizzle-kit migrate



INITIAL TESTING use push later on prod use generate and migrate as it keeps the timestamp of the migration and allows for better tracking of changes over time. This is especially useful in production environments where maintaining a clear history of database changes is crucial for debugging and auditing purposes.
*/
