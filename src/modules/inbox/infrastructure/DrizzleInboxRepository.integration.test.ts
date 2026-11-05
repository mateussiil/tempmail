// @vitest-environment node
// Roda contra um Postgres de verdade e só quando TEST_DATABASE_URL está definida
// (o CI define; localmente: TEST_DATABASE_URL=postgres://... npm test). Cria um
// banco descartável só dele, então o banco da URL não é alterado.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";
import * as schema from "@/shared/db/schema";
import { InboxAddressConflictError } from "../application/InboxRepository";
import { Inbox } from "../domain/Inbox";
import { DrizzleInboxRepository } from "./DrizzleInboxRepository";

const url = process.env.TEST_DATABASE_URL;

const t0 = new Date("2026-11-05T12:00:00.000Z");
const hours = (n: number) => new Date(t0.getTime() + n * 3_600_000);
const inbox = (id: string, address: string, ownerId: string, expiresAt: Date | null, createdAt = t0) =>
  new Inbox(id, address, ownerId, expiresAt, createdAt);

describe.skipIf(!url)("DrizzleInboxRepository (Postgres real)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let repository: DrizzleInboxRepository;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    repository = new DrizzleInboxRepository(drizzle(pool, { schema }));
  });

  afterAll(async () => {
    await pool?.end();
    await isolated?.drop();
  });

  beforeEach(async () => {
    await pool.query('truncate "inbox", "session", "account", "user" cascade');
    for (const id of ["ana", "bruno"]) {
      await pool.query(
        'insert into "user" (id, name, email, github_username) values ($1, $2, $3, $4)',
        [id, id, `${id}@example.test`, id],
      );
    }
  });

  it("grava e lê de volta, com prazo e sem prazo (mantida)", async () => {
    await repository.insert(inbox("i1", "com-prazo", "ana", hours(24)));
    await repository.insert(inbox("i2", "mantida", "ana", null));

    expect(await repository.findById("i1")).toEqual(inbox("i1", "com-prazo", "ana", hours(24)));
    expect(await repository.findByAddress("mantida")).toEqual(inbox("i2", "mantida", "ana", null));
    expect(await repository.findById("nao-existe")).toBeNull();
    expect(await repository.findByAddress("nao-existe")).toBeNull();
  });

  it("recusa um endereço repetido com InboxAddressConflictError", async () => {
    await repository.insert(inbox("i1", "disputada", "ana", hours(24)));

    await expect(repository.insert(inbox("i2", "disputada", "bruno", hours(24)))).rejects.toBeInstanceOf(
      InboxAddressConflictError,
    );
    expect((await repository.findByAddress("disputada"))?.ownerId).toBe("ana");
  });

  it("não confunde outro erro do banco com conflito de endereço", async () => {
    // Dono inexistente: viola a chave estrangeira, não o endereço único.
    const error = await repository
      .insert(inbox("i1", "orfa", "ninguem", hours(24)))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(InboxAddressConflictError);
  });

  it("lista só as Caixas do dono", async () => {
    await repository.insert(inbox("i1", "da-ana-1", "ana", hours(24)));
    await repository.insert(inbox("i2", "da-ana-2", "ana", null));
    await repository.insert(inbox("i3", "do-bruno", "bruno", hours(24)));

    const listed = await repository.listByOwner("ana");

    expect(listed.map((i) => i.address).sort()).toEqual(["da-ana-1", "da-ana-2"]);
    expect(await repository.listByOwner("ninguem")).toEqual([]);
  });

  it("conta as ativas (com prazo no futuro e mantidas), sem as expiradas nem as de outros", async () => {
    const now = hours(10);
    await repository.insert(inbox("i1", "ativa", "ana", hours(24)));
    await repository.insert(inbox("i2", "mantida", "ana", null));
    await repository.insert(inbox("i3", "expirada", "ana", hours(1)));
    await repository.insert(inbox("i4", "expira-agora", "ana", now)); // o prazo igual a agora já passou
    await repository.insert(inbox("i5", "do-bruno", "bruno", hours(24)));

    expect(await repository.countActiveByOwner("ana", now)).toBe(2);
    expect(await repository.countActiveByOwner("bruno", now)).toBe(1);
    expect(await repository.countActiveByOwner("ninguem", now)).toBe(0);
  });

  it("salva mudanças de prazo nos dois sentidos e preserva o resto", async () => {
    await repository.insert(inbox("i1", "teste", "ana", hours(24)));

    await repository.save(inbox("i1", "teste", "ana", null));
    expect((await repository.findById("i1"))?.expiresAt).toBeNull();

    await repository.save(inbox("i1", "teste", "ana", hours(48)));
    const saved = await repository.findById("i1");
    expect(saved?.expiresAt).toEqual(hours(48));
    expect(saved).toMatchObject({ address: "teste", ownerId: "ana", createdAt: t0 });
  });
});
