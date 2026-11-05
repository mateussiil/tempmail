import { Pool } from "pg";
import { databaseUrl } from "@/shared/config/env";

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
