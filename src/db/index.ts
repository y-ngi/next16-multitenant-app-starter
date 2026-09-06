import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL must be configured in production");
}

const client = postgres(connectionString ?? "******localhost:5432/app", { max: 1 });
export const db = drizzle(client, { schema });
