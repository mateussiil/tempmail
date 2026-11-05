import { shouldRunMigrations } from "@/shared/config/env";
import { getPool } from "@/shared/db/client";
import { runMigrations } from "@/shared/db/migrate";

// Sem DATABASE_URL (build, CI) não há banco pra migrar: segue sem fazer nada.
// Com a variável definida, uma migration que falha derruba a subida de propósito.
if (process.env.DATABASE_URL && shouldRunMigrations()) {
  const result = await runMigrations(getPool());
  console.log(`[startup] migrations: ${result}`);
}
