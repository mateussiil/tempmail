import type { Pool } from "pg";

export type Locked<T> = { ran: true; value: T } | { ran: false };

/**
 * Roda `fn` só se conseguir o lock de aplicação `key` no Postgres (sem
 * esperar). Outro processo, ou outra execução no mesmo processo, que já esteja
 * com o lock faz esta voltar `{ ran: false }`. O lock é da conexão, então ela
 * fica separada do pool até o fim.
 */
export async function withAdvisoryLock<T>(pool: Pool, key: number, fn: () => Promise<T>): Promise<Locked<T>> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [key]);
    if (!rows[0]?.locked) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [key]);
    }
  } finally {
    client.release();
  }
}
