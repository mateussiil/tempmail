// @vitest-environment node
// A limpeza periódica de ponta a ponta: o job montado como em produção, contra
// um Postgres de verdade e o R2 simulado. Só roda com TEST_DATABASE_URL (o CI
// define), num banco descartável só dele.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Message } from "@/modules/message/domain/Message";
import { DrizzleExpiredContentStore } from "@/modules/message/infrastructure/DrizzleExpiredContentStore";
import { DrizzleMessageRepository } from "@/modules/message/infrastructure/DrizzleMessageRepository";
import { startS3Stub } from "@/modules/message/testing/s3Stub";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";
import * as schema from "@/shared/db/schema";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("limpeza periódica (Postgres real, R2 simulado)", () => {
  const saved: Record<string, string | undefined> = {};
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let s3: Awaited<ReturnType<typeof startS3Stub>>;
  let messages: DrizzleMessageRepository;
  let store: DrizzleExpiredContentStore;
  let expiration: typeof import("./expiration");
  let inbox: typeof import("./inbox");

  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);

  const createInbox = (id: string, ownerId: string, expiresAt: Date | null) =>
    pool.query("insert into inbox (id, address, owner_id, expires_at) values ($1, $1, $2, $3)", [id, ownerId, expiresAt]);

  /** Grava uma Mensagem na Caixa e o `.eml` dela no R2 simulado. */
  const deliver = async (inboxId: string, emailId: string) => {
    const id = Message.idFor(emailId, inboxId);
    const rawKey = Message.rawKeyFor(inboxId, id);
    await messages.insert(
      Message.ready({
        inboxId,
        emailId,
        messageId: null,
        fromAddress: "a@b.test",
        fromHeader: null,
        subject: "oi",
        textBody: "oi",
        htmlBody: null,
        rawKey,
        rawSize: 1,
        attachments: [],
        receivedAt: new Date(),
        createdAt: new Date(),
      }),
    );
    s3.objects.set(rawKey, Buffer.from("From: a@b.test\r\n\r\noi"));
    return { id, rawKey };
  };

  const messageCount = async (inboxId: string) =>
    (await pool.query("select count(*)::int as n from message where inbox_id = $1", [inboxId])).rows[0].n as number;
  const filesOf = (inboxId: string) => [...s3.objects.keys()].filter((k) => k.startsWith(`caixas/${inboxId}/`));
  const expiresAt = async (inboxId: string) =>
    (await pool.query("select expires_at from inbox where id = $1", [inboxId])).rows[0].expires_at as Date | null;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    const db = drizzle(pool, { schema });
    messages = new DrizzleMessageRepository(db);
    store = new DrizzleExpiredContentStore(db);
    s3 = await startS3Stub({ pageSize: 3 });

    const env: Record<string, string> = {
      DATABASE_URL: isolated.url,
      ALLOWED_GITHUB_USERS: "ana",
      R2_ENDPOINT: s3.url,
      R2_ACCESS_KEY_ID: "teste",
      R2_SECRET_ACCESS_KEY: "teste",
      R2_BUCKET: "tempmail",
    };
    for (const [name, value] of Object.entries(env)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
    expiration = await import("./expiration");
    inbox = await import("./inbox");
  });

  afterAll(async () => {
    const globals = globalThis as { __tempmailPool?: { end(): Promise<void> } };
    await globals.__tempmailPool?.end();
    delete globals.__tempmailPool;
    await pool?.end();
    await s3?.close();
    await isolated?.drop();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  beforeEach(async () => {
    process.env.ALLOWED_GITHUB_USERS = "ana";
    s3.objects.clear();
    await pool.query('truncate "message", "api_key", "inbox", "session", "account", "user" cascade');
    for (const id of ["ana", "bruno"]) {
      await pool.query('insert into "user" (id, name, email, github_username) values ($1, $1, $2, $1)', [
        id,
        `${id}@example.test`,
      ]);
    }
  });

  it("Caixa vencida perde Mensagens e arquivos; ativa e mantida ficam", async () => {
    await createInbox("vencida", "ana", hoursFromNow(-1));
    await createInbox("ativa", "ana", hoursFromNow(5));
    await createInbox("mantida", "ana", null);
    await deliver("vencida", "e1");
    await deliver("vencida", "e2");
    await deliver("ativa", "e3");
    await deliver("mantida", "e4");

    const report = await expiration.composeExpirationJob().run();

    // O Bruno não está na lista, mas não tem Caixas: conta como quem saiu, sem nada a expirar.
    expect(report).toMatchObject({ purgedInboxes: 1, deletedMessages: 2, departedMembers: 1, expiredInboxes: 0, failedSteps: [] });
    expect(await messageCount("vencida")).toBe(0);
    expect(filesOf("vencida")).toEqual([]);
    expect(await messageCount("ativa")).toBe(1);
    expect(filesOf("ativa")).toHaveLength(1);
    expect(await messageCount("mantida")).toBe(1);
    // O registro da Caixa fica, com endereço e Dono.
    expect((await pool.query("select owner_id from inbox where id = 'vencida'")).rows[0].owner_id).toBe("ana");
  });

  it("a varredura tira do R2 os arquivos de Caixas expiradas ou inexistentes", async () => {
    await createInbox("vencida-sem-linhas", "ana", hoursFromNow(-1));
    await createInbox("ativa", "ana", hoursFromNow(5));
    s3.objects.set("caixas/vencida-sem-linhas/x.eml", Buffer.from("x"));
    s3.objects.set("caixas/nao-existe/y.eml", Buffer.from("y"));
    s3.objects.set("caixas/ativa/z.eml", Buffer.from("z"));

    const report = await expiration.composeExpirationJob().run();

    expect(report).toMatchObject({ sweptFiles: 2 });
    expect([...s3.objects.keys()]).toEqual(["caixas/ativa/z.eml"]);
  });

  it("quem sai da lista tem as Caixas expiradas (inclusive mantidas) e esvaziadas na mesma execução", async () => {
    await createInbox("do-bruno", "bruno", hoursFromNow(5));
    await createInbox("do-bruno-mantida", "bruno", null);
    await createInbox("da-ana", "ana", hoursFromNow(5));
    await deliver("do-bruno", "e1");
    await deliver("do-bruno-mantida", "e2");

    const report = await expiration.composeExpirationJob().run();

    expect(report).toMatchObject({ departedMembers: 1, expiredInboxes: 2, purgedInboxes: 2, deletedMessages: 2 });
    expect((await expiresAt("do-bruno"))!.getTime()).toBeLessThanOrEqual(Date.now());
    expect((await expiresAt("do-bruno-mantida"))!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await messageCount("do-bruno-mantida")).toBe(0);
    expect(filesOf("do-bruno")).toEqual([]);
    expect((await expiresAt("da-ana"))!.getTime()).toBeGreaterThan(Date.now());
  });

  it("lista vazia não expira ninguém", async () => {
    process.env.ALLOWED_GITHUB_USERS = "";
    await createInbox("da-ana", "ana", null);

    const report = await expiration.composeExpirationJob().run();

    expect(report).toMatchObject({ departedMembers: "skipped_empty_allowlist", expiredInboxes: 0 });
    expect(await expiresAt("da-ana")).toBeNull();
  });

  it("duas execuções ao mesmo tempo: uma roda, a outra pula", async () => {
    await createInbox("vencida", "ana", hoursFromNow(-1));
    for (let i = 0; i < 5; i++) await deliver("vencida", `e${i}`);

    const results = await Promise.all([expiration.composeExpirationJob().run(), expiration.composeExpirationJob().run()]);

    const skipped = results.filter((r) => "skipped" in r);
    const ran = results.filter((r) => !("skipped" in r));
    expect(skipped).toHaveLength(1);
    expect(ran).toHaveLength(1);
    expect(ran[0]).toMatchObject({ deletedMessages: 5 });
    expect(await messageCount("vencida")).toBe(0);
  });

  it("se os arquivos falham, as Mensagens voltam (a transação desfaz)", async () => {
    await createInbox("vencida", "ana", hoursFromNow(-1));
    await deliver("vencida", "e1");

    await expect(
      store.purge("vencida", new Date(), async () => {
        throw new Error("R2 fora do ar");
      }),
    ).rejects.toThrow("R2 fora do ar");

    expect(await messageCount("vencida")).toBe(1);
  });

  it("uma reativação durante a purga espera, e a Caixa volta vazia", async () => {
    await createInbox("volta", "ana", hoursFromNow(-1));
    await deliver("volta", "e1");
    let release: () => void = () => {};
    const filesStarted = new Promise<void>((started) => {
      void store.purge("volta", new Date(), async () => {
        started();
        await new Promise<void>((r) => (release = r));
      });
    });
    await filesStarted;

    // A reativação esbarra no lock da linha e só termina depois da purga.
    const reactivation = pool.query("update inbox set expires_at = $1 where id = 'volta'", [hoursFromNow(24)]);
    await new Promise((r) => setTimeout(r, 100));
    expect(await messageCount("volta")).toBe(1);
    release();
    await reactivation;

    expect(await messageCount("volta")).toBe(0);
    // E uma purga depois da reativação não mexe mais nela.
    await deliver("volta", "e2");
    expect(await store.purge("volta", new Date(), async () => {})).toBeNull();
    expect(await messageCount("volta")).toBe(1);
  });

  it("reativar pela API esvazia a Caixa na hora, sem esperar o job", async () => {
    await createInbox("reativa", "ana", hoursFromNow(-1));
    await deliver("reativa", "e1");

    const result = await inbox.composeInboxUseCases().reactivate.execute({ ownerId: "ana", inboxId: "reativa" });

    expect(result.ok).toBe(true);
    expect(await messageCount("reativa")).toBe(0);
    expect(filesOf("reativa")).toEqual([]);
  });
});
