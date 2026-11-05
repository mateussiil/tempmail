import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

/** A pasta `drizzle/` é copiada pra imagem Docker ao lado do `server.js`. */
export function defaultMigrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

/**
 * Aplica as migrations pendentes. Sem nenhuma migration gerada ainda (sem o
 * `meta/_journal.json`), não há o que fazer e a subida segue normalmente.
 */
export async function runMigrations(
  pool: Pool,
  folder: string = defaultMigrationsFolder(),
): Promise<"applied" | "skipped"> {
  if (!existsSync(path.join(folder, "meta", "_journal.json"))) return "skipped";
  await migrate(drizzle(pool), { migrationsFolder: folder });
  return "applied";
}
