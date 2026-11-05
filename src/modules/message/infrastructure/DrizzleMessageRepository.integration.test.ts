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
import { Message } from "../domain/Message";
import { DrizzleMessageRepository, MESSAGE_CHANNEL } from "./DrizzleMessageRepository";

const url = process.env.TEST_DATABASE_URL;

const t0 = new Date("2026-11-05T12:00:00.000Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

function ready(emailId: string, inboxId = "inbox-1", overrides: Partial<Parameters<typeof Message.ready>[0]> = {}) {
  return Message.ready({
    inboxId,
    emailId,
    messageId: `<${emailId}@mail.test>`,
    fromAddress: "noreply@github.com",
    fromHeader: "GitHub <noreply@github.com>",
    subject: "Seu código de verificação",
    textBody: "Use o código 482913",
    htmlBody: "<p>Use o código <b>482913</b></p>",
    rawKey: `caixas/${inboxId}/${Message.idFor(emailId, inboxId)}.eml`,
    rawSize: 1234,
    attachments: [
      { id: "att-1", filename: "nota.pdf", contentType: "application/pdf", contentDisposition: null, contentId: null, size: 99 },
    ],
    receivedAt: t0,
    createdAt: t0,
    ...overrides,
  });
}

describe.skipIf(!url)("DrizzleMessageRepository (Postgres real)", () => {
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let repository: DrizzleMessageRepository;
  let listener: Client;
  const notifications: { inboxId: string; messageId: string }[] = [];

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    repository = new DrizzleMessageRepository(drizzle(pool, { schema }));

    listener = new Client({ connectionString: isolated.url });
    await listener.connect();
    await listener.query(`LISTEN ${MESSAGE_CHANNEL}`);
    listener.on("notification", (n) => notifications.push(JSON.parse(n.payload ?? "{}")));
  });

  afterAll(async () => {
    await listener?.end();
    await pool?.end();
    await isolated?.drop();
  });

  beforeEach(async () => {
    notifications.length = 0;
    await pool.query('truncate "message", "inbox", "session", "account", "user" cascade');
    await pool.query(
      `insert into "user" (id, name, email, github_username) values ('ana', 'Ana', 'ana@example.test', 'ana')`,
    );
    for (const id of ["inbox-1", "inbox-2"]) {
      await pool.query("insert into inbox (id, address, owner_id, expires_at) values ($1, $2, 'ana', null)", [id, id]);
    }
  });

  afterEach(() => {
    notifications.length = 0;
  });

  const waitForNotifications = async (count: number) => {
    const deadline = Date.now() + 3000;
    while (notifications.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };

  it("grava e lê de volta todos os campos, inclusive datas e anexos", async () => {
    const message = ready("email-1");

    expect(await repository.insert(message)).toBe(true);
    const found = await repository.findById(message.id);

    expect(found).toEqual(message);
    expect(found?.attachments).toEqual(message.attachments);
    expect(found?.receivedAt).toEqual(t0);
    expect(await repository.findById("nao-existe")).toBeNull();
  });

  it("grava a Mensagem sem conteúdo (cota estourada e grande demais)", async () => {
    const base = {
      inboxId: "inbox-1",
      messageId: null,
      fromAddress: "loja@exemplo.test",
      subject: "Pedido #1042",
      attachments: [],
      receivedAt: t0,
      createdAt: t0,
    };
    const quota = Message.withoutContent({ ...base, emailId: "e-quota" }, "quota_exceeded");
    const large = Message.withoutContent({ ...base, emailId: "e-large" }, "too_large");

    await repository.insert(quota);
    await repository.insert(large);

    expect(await repository.findById(quota.id)).toEqual(quota);
    expect((await repository.findById(large.id))?.status).toBe("too_large");
  });

  it("repetir a mesma Mensagem devolve false, não duplica e não avisa de novo", async () => {
    const message = ready("email-1");

    expect(await repository.insert(message)).toBe(true);
    await waitForNotifications(1);
    expect(await repository.insert(message)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const { rows } = await pool.query("select count(*)::int as n from message");
    expect(rows[0].n).toBe(1);
    expect(notifications).toHaveLength(1);
  });

  it("o mesmo email em Caixas diferentes vira Mensagens diferentes", async () => {
    expect(await repository.insert(ready("email-1", "inbox-1"))).toBe(true);
    expect(await repository.insert(ready("email-1", "inbox-2"))).toBe(true);

    const { rows } = await pool.query("select count(*)::int as n from message");
    expect(rows[0].n).toBe(2);
  });

  it("avisa pelo NOTIFY a cada Mensagem nova, com a Caixa e o id", async () => {
    const message = ready("email-1", "inbox-2");

    await repository.insert(message);
    await waitForNotifications(1);

    expect(notifications).toEqual([{ inboxId: "inbox-2", messageId: message.id }]);
  });

  it("a Mensagem já está visível quando o aviso chega", async () => {
    let visibleOnNotify: boolean | null = null;
    listener.once("notification", async (n) => {
      const { messageId } = JSON.parse(n.payload ?? "{}");
      const { rows } = await pool.query("select 1 from message where id = $1", [messageId]);
      visibleOnNotify = rows.length === 1;
    });

    await repository.insert(ready("email-1"));
    await waitForNotifications(1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(visibleOnNotify).toBe(true);
  });

  it("lista as da Caixa, as mais recentes primeiro, respeitando o limite", async () => {
    await repository.insert(ready("e1", "inbox-1", { receivedAt: minutes(1) }));
    await repository.insert(ready("e3", "inbox-1", { receivedAt: minutes(3) }));
    await repository.insert(ready("e2", "inbox-1", { receivedAt: minutes(2) }));
    await repository.insert(ready("e9", "inbox-2", { receivedAt: minutes(9) }));

    const all = await repository.listByInbox("inbox-1", 10);
    const two = await repository.listByInbox("inbox-1", 2);

    expect(all.map((m) => m.emailId)).toEqual(["e3", "e2", "e1"]);
    expect(two.map((m) => m.emailId)).toEqual(["e3", "e2"]);
    expect(await repository.listByInbox("sem-mensagens", 10)).toEqual([]);
  });

  it("diz quais ids já existem", async () => {
    const a = ready("e1");
    await repository.insert(a);

    expect(await repository.existingIds([a.id, "outro-id"])).toEqual(new Set([a.id]));
    expect(await repository.existingIds([])).toEqual(new Set());
  });

  it("tira o byte nulo, que o Postgres recusa em texto", async () => {
    const message = ready("e1", "inbox-1", {
      subject: "Olá\u0000mundo",
      textBody: "texto\u0000com nulo",
      htmlBody: "<p>a\u0000b</p>",
    });

    expect(await repository.insert(message)).toBe(true);

    const found = await repository.findById(message.id);
    expect(found?.subject).toBe("Olámundo");
    expect(found?.textBody).toBe("textocom nulo");
    expect(found?.htmlBody).toBe("<p>ab</p>");
  });

  it("recusa Mensagem de Caixa inexistente", async () => {
    await expect(repository.insert(ready("e1", "nao-existe"))).rejects.toThrow();
  });

  it("recusa um status fora dos três permitidos", async () => {
    await expect(
      pool.query(
        `insert into message (id, inbox_id, email_id, from_address, subject, status, received_at)
         values ('x', 'inbox-1', 'e', 'a@b.test', 's', 'invalido', now())`,
      ),
    ).rejects.toThrow(/message_status_check/);
  });

  it("apagar a Caixa apaga as Mensagens dela", async () => {
    await repository.insert(ready("e1", "inbox-1"));
    await repository.insert(ready("e2", "inbox-2"));

    await pool.query("delete from inbox where id = 'inbox-1'");

    const { rows } = await pool.query("select inbox_id from message");
    expect(rows).toEqual([{ inbox_id: "inbox-2" }]);
  });
});
