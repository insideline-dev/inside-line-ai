import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.NODE_ENV === "development" && process.env.DEV_DATABASE_URL
    ? process.env.DEV_DATABASE_URL
    : process.env.DATABASE_URL;

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl!,
  },
});
