import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Next.js の .env.local を明示的にロード
config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});