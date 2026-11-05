// @vitest-environment node
// Roda contra um Postgres de verdade e só quando TEST_DATABASE_URL está definida
// (o CI define). Cria um banco descartável só dele, então o banco da URL não é alterado.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";
import * as schema from "@/shared/db/schema";
import { WaitForMessageUseCase } from "../application/WaitForMessageUseCase";
import { Message } from "../domain/Message";
import { FakeInboxDirectory } from "../testing/fakes";
import { DrizzleMessageRepository } from "./DrizzleMessageRepository";
import { PostgresNewMessageSignal } from "./PostgresNewMessageSignal";

const url = process.env.TEST_DATABASE_URL;

function ready(emailId: string, inboxId: string, createdAt: Date): Message {
  return Message.ready({
    inboxId,
    emailId,
    messageId: null,
    fromAddress: "noreply@exemplo.test",
    fromHeader: null,
    subject: `Seu código de verificação (${emailId})`,
    textBody: "Use o código 482913",
    htmlBody: null,
    rawKey: null,
    rawSize: null,
    attachments: [],
    receivedAt: createdAt,
    createdAt,
  });
}

const until = async (condition: () => boolean, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condição não aconteceu a tempo");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe.skipIf(!url)("PostgresNewMessageSignal e a espera (Postgres real)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let repository: DrizzleMessageRepository;
  let signal: PostgresNewMessageSignal;
  const logs: string[] = [];

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    repository = new DrizzleMessageRepository(drizzle(pool, { schema }));
  });

  afterAll(async () => {
    await pool?.end();
    await isolated?.drop();
  });

  beforeEach(async () => {
    logs.length = 0;
    signal = new PostgresNewMessageSignal(
      () => new Client({ connectionString: isolated.url, application_name: "tempmail-listen" }),
      (event) => logs.push(event),
    );
    await pool.query('truncate "message", "inbox", "session", "account", "user" cascade');
    await pool.query(
      `insert into "user" (id, name, email, github_username) values ('ana', 'Ana', 'ana@example.test', 'ana')`,
    );
    for (const id of ["inbox-1", "inbox-2"]) {
      await pool.query("insert into inbox (id, address, owner_id, expires_at) values ($1, $2, 'ana', null)", [id, id]);
    }
  });

  afterEach(async () => {
    await signal.close();
  });

  it("listCreatedAfter devolve só as gravadas depois do cursor, a mais antiga primeiro", async () => {
    const t0 = new Date("2026-11-05T12:00:00.000Z");
    const at = (s: number) => new Date(t0.getTime() + s * 1000);
    await repository.insert(ready("e1", "inbox-1", at(1)));
    await repository.insert(ready("e3", "inbox-1", at(3)));
    await repository.insert(ready("e2", "inbox-1", at(2)));
    await repository.insert(ready("e9", "inbox-2", at(9)));

    const after = await repository.listCreatedAfter("inbox-1", at(1), 10);

    expect(after.map((m) => m.emailId)).toEqual(["e2", "e3"]);
    expect(await repository.listCreatedAfter("inbox-1", at(3), 10)).toEqual([]);
  });

  it("listCreatedAfter não devolve de novo uma linha gravada com microssegundos", async () => {
    await repository.insert(ready("e1", "inbox-1", new Date()));
    await pool.query("update message set created_at = '2026-11-05T12:00:00.123456Z'");
    const [row] = await repository.listByInbox("inbox-1", 1);

    expect(row.createdAt.toISOString()).toBe("2026-11-05T12:00:00.123Z");
    expect(await repository.listCreatedAfter("inbox-1", row.createdAt, 10)).toEqual([]);
  });

  it("avisa quem escuta a Caixa quando uma Mensagem é gravada, e só essa Caixa", async () => {
    let one = 0;
    let two = 0;
    const stopOne = await signal.subscribe("inbox-1", () => one++);
    await signal.subscribe("inbox-2", () => two++);

    await repository.insert(ready("e1", "inbox-1", new Date()));
    await until(() => one === 1);

    expect(two).toBe(0);

    await stopOne();
    await repository.insert(ready("e2", "inbox-1", new Date()));
    await repository.insert(ready("e3", "inbox-2", new Date()));
    await until(() => two === 1);
    expect(one).toBe(1);
  });

  it("usa uma conexão só para várias esperas", async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => signal.subscribe(`inbox-${(i % 2) + 1}`, () => {})),
    );

    const { rows } = await pool.query(
      "select count(*)::int as n from pg_stat_activity where application_name = 'tempmail-listen' and datname = current_database()",
    );
    expect(rows[0].n).toBe(1);
  });

  it("se a conexão cair, acorda quem espera e volta a escutar", async () => {
    let woken = 0;
    await signal.subscribe("inbox-1", () => woken++);

    await pool.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'tempmail-listen' and datname = current_database()",
    );
    await until(() => woken >= 1);
    expect(logs).toContain("mcp.listen_lost");

    // Reconecta sozinho: um aviso novo volta a chegar.
    const before = woken;
    const deadline = Date.now() + 3_000;
    while (woken === before && Date.now() < deadline) {
      await repository.insert(ready(`e-${Date.now()}`, "inbox-1", new Date()));
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(woken).toBeGreaterThan(before);
  });

  it("wait_for_email: espera, recebe pelo NOTIFY e devolve o código", async () => {
    const wait = new WaitForMessageUseCase({
      directory: new FakeInboxDirectory([{ id: "inbox-1", address: "inbox-1", active: true, ownerId: "ana" }]),
      repository,
      signal,
      clock: () => new Date(),
      // Longo de propósito: só o NOTIFY pode acordar a espera a tempo.
      progressIntervalMs: 60_000,
    });

    const started = Date.now();
    const pending = wait.execute({ ownerId: "ana", inboxId: "inbox-1", timeoutMs: 10_000 });
    await new Promise((r) => setTimeout(r, 100));
    await repository.insert(ready("e1", "inbox-1", new Date()));
    const result = await pending;

    expect(result.ok && result.value.status === "received" && result.value.message.verificationCode).toBe(
      "482913",
    );
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
