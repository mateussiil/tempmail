import { describe, expect, it } from "vitest";
import { Message } from "../domain/Message";
import { FakeExpiredContentStore, FakeMessageRepository, FakeRawEmailStore } from "../testing/fakes";
import { PurgeExpiredContentUseCase } from "./PurgeExpiredContentUseCase";
import { SweepOrphanFilesUseCase } from "./SweepOrphanFilesUseCase";

const now = new Date("2026-11-05T12:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);

function message(inboxId: string, emailId: string): Message {
  const id = Message.idFor(emailId, inboxId);
  return Message.ready({
    inboxId,
    emailId,
    messageId: null,
    fromAddress: "a@b.test",
    fromHeader: null,
    subject: "oi",
    textBody: "oi",
    htmlBody: null,
    rawKey: Message.rawKeyFor(inboxId, id),
    rawSize: 1,
    attachments: [],
    receivedAt: hours(-30),
    createdAt: hours(-30),
  });
}

function setup() {
  const messages = new FakeMessageRepository();
  const store = new FakeExpiredContentStore(messages);
  const bucket = new FakeRawEmailStore();
  const logs: string[] = [];

  const deliver = async (inboxId: string, emailId: string) => {
    const m = message(inboxId, emailId);
    await messages.insert(m);
    bucket.objects.set(m.rawKey!, new Uint8Array([1]));
    return m;
  };

  const purge = (withBucket = true) =>
    new PurgeExpiredContentUseCase({
      store,
      bucket: withBucket ? bucket : null,
      clock: () => now,
      log: (event) => logs.push(event),
    });

  return { messages, store, bucket, logs, deliver, purge };
}

describe("PurgeExpiredContentUseCase", () => {
  it("apaga as Mensagens e os arquivos só das Caixas vencidas", async () => {
    const s = setup();
    s.store.expiresAt.set("vencida", hours(-1));
    s.store.expiresAt.set("ativa", hours(5));
    s.store.expiresAt.set("mantida", null);
    await s.deliver("vencida", "e1");
    await s.deliver("vencida", "e2");
    const kept = await s.deliver("ativa", "e3");
    const keptForever = await s.deliver("mantida", "e4");

    const report = await s.purge().execute();

    expect(report).toEqual({ purgedInboxes: 1, deletedMessages: 2, failedInboxes: 0 });
    expect([...s.messages.messages.keys()].sort()).toEqual([kept.id, keptForever.id].sort());
    expect([...s.bucket.objects.keys()].sort()).toEqual([kept.rawKey, keptForever.rawKey].sort());
  });

  it("rodar de novo não faz nada", async () => {
    const s = setup();
    s.store.expiresAt.set("vencida", hours(-1));
    await s.deliver("vencida", "e1");
    await s.purge().execute();

    expect(await s.purge().execute()).toEqual({ purgedInboxes: 0, deletedMessages: 0, failedInboxes: 0 });
  });

  it("se o bucket falha numa Caixa, ela fica intacta para a próxima vez e as outras seguem", async () => {
    const s = setup();
    s.store.expiresAt.set("quebra", hours(-1));
    s.store.expiresAt.set("ok", hours(-1));
    const broken = await s.deliver("quebra", "e1");
    await s.deliver("ok", "e2");
    s.bucket.failOn = (key) => key.startsWith("caixas/quebra/");

    const report = await s.purge().execute();

    expect(report).toEqual({ purgedInboxes: 1, deletedMessages: 1, failedInboxes: 1 });
    expect(s.messages.messages.has(broken.id)).toBe(true);
    expect(s.logs).toContain("expiration.purge_failed");

    s.bucket.failOn = () => false;
    expect((await s.purge().execute()).purgedInboxes).toBe(1);
  });

  it("sem bucket configurado, apaga só as linhas", async () => {
    const s = setup();
    s.store.expiresAt.set("vencida", hours(-1));
    await s.deliver("vencida", "e1");

    expect((await s.purge(false).execute()).deletedMessages).toBe(1);
    expect(s.bucket.objects.size).toBe(1);
  });

  it("passa por lotes maiores que um", async () => {
    const s = setup();
    for (let i = 0; i < 120; i++) {
      s.store.expiresAt.set(`c${i}`, hours(-1));
      await s.deliver(`c${i}`, `e${i}`);
    }

    expect((await s.purge().execute()).purgedInboxes).toBe(120);
    expect(s.messages.messages.size).toBe(0);
  });
});

describe("SweepOrphanFilesUseCase", () => {
  it("apaga os arquivos de Caixas inativas ou inexistentes e deixa o resto", async () => {
    const bucket = new FakeRawEmailStore();
    for (const key of ["caixas/ativa/m1.eml", "caixas/vencida/m2.eml", "caixas/sumiu/m3.eml", "outra-coisa/x"]) {
      bucket.objects.set(key, new Uint8Array([1]));
    }
    const asked: string[][] = [];
    const sweep = new SweepOrphanFilesUseCase({
      bucket,
      inboxes: {
        activeIds: async (ids) => {
          asked.push([...ids].sort());
          return new Set(ids.filter((id) => id === "ativa"));
        },
      },
    });

    expect(await sweep.execute()).toEqual({ deletedFiles: 2 });
    expect([...bucket.objects.keys()].sort()).toEqual(["caixas/ativa/m1.eml", "outra-coisa/x"]);
    expect(asked).toEqual([["ativa", "sumiu", "vencida"]]);
  });

  it("bucket vazio não consulta nada nem apaga nada", async () => {
    const bucket = new FakeRawEmailStore();
    const sweep = new SweepOrphanFilesUseCase({ bucket, inboxes: { activeIds: async () => new Set() } });

    expect(await sweep.execute()).toEqual({ deletedFiles: 0 });
  });
});

describe("chaves do bucket", () => {
  it("acha a Caixa pela chave", () => {
    expect(Message.inboxIdOfKey("caixas/abc/m.eml")).toBe("abc");
    expect(Message.inboxIdOfKey("caixas/m.eml")).toBeNull();
    expect(Message.inboxIdOfKey("outra/abc/m.eml")).toBeNull();
    expect(Message.inboxPrefix("abc")).toBe("caixas/abc/");
  });
});
