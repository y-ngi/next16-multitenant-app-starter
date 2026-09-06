import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET must be configured in production");
}

const createAuth = (basePath: string) =>
  betterAuth({
    secret: secret ?? "local-development-secret-change-me",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    basePath,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    plugins: [organization()],
  });

export const adminAuth = createAuth("/api/admin/auth");
export const userAuth = createAuth("/api/auth");
