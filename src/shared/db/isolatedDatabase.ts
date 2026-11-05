import { randomBytes } from "node:crypto";
import { Pool } from "pg";

/**
 * Banco descartável para um arquivo de teste de integração. Cada arquivo cria o
 * seu a partir de `baseUrl` (qualquer banco do servidor, com permissão de criar
 * bancos), então os arquivos rodam em paralelo sem apagar os dados uns dos
 * outros, e o banco-base nunca é tocado.
 */
export async function createIsolatedDatabase(baseUrl: string) {
  const name = `tempmail_test_${randomBytes(6).toString("hex")}`;

  const admin = new Pool({ connectionString: baseUrl, max: 1 });
  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    /** Apaga o banco (encerrando conexões que sobrarem). Feche seus pools antes, de preferência. */
    async drop() {
      const cleanup = new Pool({ connectionString: baseUrl, max: 1 });
      try {
        await cleanup.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
