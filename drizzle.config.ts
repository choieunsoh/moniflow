import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/features/*/schema.ts',
  out: './drizzle/migrations',
});
