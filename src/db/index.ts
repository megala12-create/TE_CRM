import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  // Reuse one pool across hot reloads in development. Serverless (Vercel) runs many
  // small instances, so each keeps only a few connections.
  globalForDb.pgClient ??= postgres(url, { max: process.env.VERCEL ? 3 : 10 });
  return globalForDb.pgClient;
}

function connect() {
  return drizzle(client(), { schema });
}

export type DB = ReturnType<typeof connect>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// Connect on first use, not at import: `next build` loads route modules to collect
// page config, and the build machine has no database.
let instance: DB | undefined;
export const db = new Proxy({} as DB, {
  get(_, prop) {
    instance ??= connect();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
export { schema };
