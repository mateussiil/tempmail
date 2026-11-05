// @vitest-environment node
// Roda contra um Postgres de verdade e só quando TEST_DATABASE_URL está definida.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";
import * as schema from "@/shared/db/schema";
import { ApiKey } from "../domain/ApiKey";
import { DrizzleApiKeyRepository } from "./DrizzleApiKeyRepository";

const url = process.env.TEST_DATABASE_URL;
const t0 = new Date("2026-11-05T12:00:00.000Z");
const key = (id: string, memberId: string, createdAt = t0) =>
  new ApiKey(id, memberId, `chave ${id}`, `tm_${id}`, createdAt, null, null);

describe.skipIf(!url)("DrizzleApiKeyRepository (Postgres real)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let repository: DrizzleApiKeyRepository;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    repository = new DrizzleApiKeyRepository(drizzle(pool, { schema }));
  });

  afterAll(async () => {
    await pool?.end();
    await isolated?.drop();
  });

  beforeEach(async () => {
    await pool.query('truncate "api_key", "inbox", "session", "account", "user" cascade');
    for (const id of ["ana", "bruno"]) {
      await pool.query(
        'insert into "user" (id, name, email, github_username) values ($1, $2, $3, $4)',
        [id, id, `${id}@example.test`, id],
      );
    }
  });

  it("acha a chave pelo hash, com o dono, e nunca pelo segredo", async () => {
    await repository.insert(key("k1", "ana"), "hash-1");

    const found = await repository.findByHash("hash-1");

    expect(found?.key).toEqual(key("k1", "ana"));
    expect(found?.owner).toMatchObject({ id: "ana", githubUsername: "ana" });
    expect(await repository.findByHash("outro")).toBeNull();
    const [row] = (await pool.query('select * from "api_key"')).rows;
    expect(Object.keys(row)).not.toContain("token");
  });

  it("recusa hash repetido", async () => {
    await repository.insert(key("k1", "ana"), "mesmo");

    await expect(repository.insert(key("k2", "bruno"), "mesmo")).rejects.toThrow();
  });

  it("lista só as chaves do Membro", async () => {
    await repository.insert(key("k1", "ana"), "h1");
    await repository.insert(key("k2", "ana"), "h2");
    await repository.insert(key("k3", "bruno"), "h3");

    expect((await repository.listByMember("ana")).map((k) => k.id).sort()).toEqual(["k1", "k2"]);
    expect(await repository.listByMember("ninguem")).toEqual([]);
  });

  it("revoga só a chave do dono, e repetir mantém a primeira data", async () => {
    await repository.insert(key("k1", "ana"), "h1");
    const at = new Date(t0.getTime() + 1000);

    expect(await repository.revoke("k1", "bruno", at)).toBe(false);
    expect((await repository.findByHash("h1"))?.key.isActive).toBe(true);

    expect(await repository.revoke("k1", "ana", at)).toBe(true);
    expect(await repository.revoke("k1", "ana", new Date(t0.getTime() + 9000))).toBe(true);
    expect((await repository.findByHash("h1"))?.key.revokedAt).toEqual(at);
    expect(await repository.revoke("nao-existe", "ana", at)).toBe(false);
  });

  it("registra o último uso", async () => {
    await repository.insert(key("k1", "ana"), "h1");
    const at = new Date(t0.getTime() + 5000);

    await repository.touchLastUsed("k1", at);

    expect((await repository.findByHash("h1"))?.key.lastUsedAt).toEqual(at);
  });

  it("apagar o Membro apaga as chaves dele", async () => {
    await repository.insert(key("k1", "ana"), "h1");

    await pool.query('delete from "user" where id = $1', ["ana"]);

    expect(await repository.findByHash("h1")).toBeNull();
  });
});
