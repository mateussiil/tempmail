import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrl } from "@/shared/config/env";
import * as schema from "./schema";

const globalForPool = globalThis as unknown as { __tempmailPool?: Pool };

/** Pool único por processo (sobrevive ao hot reload do `next dev`). */
export function getPool(): Pool {
  if (!globalForPool.__tempmailPool) {
    globalForPool.__tempmailPool = new Pool({
      connectionString: databaseUrl(),
      connectionTimeoutMillis: 3000,
      max: 10,
    });
  }
  return globalForPool.__tempmailPool;
}

/** Acesso tipado às tabelas, sobre o pool único. */
export function getDb() {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;
