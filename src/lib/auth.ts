import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

const secret = process.env.BETTER_AUTH_SECRET ?? crypto.randomUUID();

const createAuth = (basePath: string) =>
  betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    basePath,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
        organization: schema.organizations,
        member: schema.members,
        invitation: schema.invitations,
      },
    }),
    emailAndPassword: { enabled: true },
    plugins: [organization()],
  });

export const adminAuth = createAuth("/api/admin/auth");
export const userAuth = createAuth("/api/auth");
