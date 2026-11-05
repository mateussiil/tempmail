// @vitest-environment node
// Download do .eml, cabeçalhos e anexos pelas rotas: Chave de API de verdade,
// Postgres de verdade e o R2 simulado por um servidor local. Só roda com
// TEST_DATABASE_URL (o CI define), num banco descartável só dele.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Message } from "@/modules/message/domain/Message";
import { DrizzleMessageRepository } from "@/modules/message/infrastructure/DrizzleMessageRepository";
import { sampleEml } from "@/modules/message/testing/sampleEml";
import { startStubServer } from "@/modules/message/testing/stubServer";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";
import * as schema from "@/shared/db/schema";

const current = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => current.headers }));

const url = process.env.TEST_DATABASE_URL;

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

describe.skipIf(!url)("GET /api/messages/{id}/raw, /headers e /attachments/{n} (Postgres real, R2 simulado)", () => {
  const saved: Record<string, string | undefined> = {};
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let r2: Awaited<ReturnType<typeof startStubServer>>;
  let raw: Handler;
  let headers: Handler;
  let attachment: Handler;
  let keys: Record<string, string>;
  const objects = new Map<string, Uint8Array>();

  const get = (handler: Handler, key: string, params: Record<string, string>) => {
    const request = new Request("http://localhost/api/x", { headers: { authorization: `Bearer ${key}` } });
    current.headers = request.headers;
    return handler(request, { params: Promise.resolve(params) });
  };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));

    r2 = await startStubServer((request) => {
      const key = decodeURIComponent(new URL(request.url, "http://r2").pathname.replace(/^\/tempmail\//, ""));
      const bytes = objects.get(key);
      return bytes
        ? { status: 200, headers: { "content-type": "message/rfc822" }, body: Buffer.from(bytes) }
        : { status: 404, headers: { "content-type": "application/xml" }, body: "<Error><Code>NoSuchKey</Code></Error>" };
    });

    const env: Record<string, string> = {
      DATABASE_URL: isolated.url,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "segredo-so-de-teste-com-32-caracteres!!",
      GITHUB_CLIENT_ID: "teste",
      GITHUB_CLIENT_SECRET: "teste",
      ALLOWED_GITHUB_USERS: "ana,bruno",
      R2_ENDPOINT: r2.url,
      R2_ACCESS_KEY_ID: "teste",
      R2_SECRET_ACCESS_KEY: "teste",
      R2_BUCKET: "tempmail",
    };
    for (const [name, value] of Object.entries(env)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
    delete (globalThis as { __tempmailLimiter?: unknown }).__tempmailLimiter;

    raw = (await import("./route")).GET as Handler;
    headers = (await import("../headers/route")).GET as Handler;
    attachment = (await import("../attachments/[index]/route")).GET as Handler;
  });

  afterAll(async () => {
    const globals = globalThis as { __tempmailPool?: { end(): Promise<void> } };
    await globals.__tempmailPool?.end();
    delete globals.__tempmailPool;
    await pool?.end();
    await r2?.close();
    await isolated?.drop();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  let message: Message;

  beforeEach(async () => {
    objects.clear();
    await pool.query('truncate "message", "api_key", "inbox", "session", "account", "user" cascade');
    for (const id of ["ana", "bruno"]) {
      await pool.query('insert into "user" (id, name, email, github_username) values ($1, $1, $2, $1)', [
        id,
        `${id}@example.test`,
      ]);
    }
    await pool.query("insert into inbox (id, address, owner_id, expires_at) values ('inbox-ana', 'da-ana', 'ana', null)");

    const { composeApiKeyUseCases } = await import("@/composition/apiKeys");
    keys = {};
    for (const memberId of ["ana", "bruno"]) {
      const created = await composeApiKeyUseCases().create.execute({ memberId, name: "teste" });
      if (!created.ok) throw new Error("não criou a chave");
      keys[memberId] = created.value.token;
    }

    const id = Message.idFor("email-1", "inbox-ana");
    const rawKey = Message.rawKeyFor("inbox-ana", id);
    message = Message.ready({
      inboxId: "inbox-ana",
      emailId: "email-1",
      messageId: null,
      fromAddress: "pedidos@loja.exemplo",
      fromHeader: "Loja Exemplo <pedidos@loja.exemplo>",
      subject: "Pedido 1042 confirmado",
      textBody: "A nota fiscal segue em anexo.",
      htmlBody: null,
      rawKey,
      rawSize: 100,
      attachments: [
        { id: "att-1", filename: "nota-fiscal-1042.pdf", contentType: "application/pdf", contentDisposition: "attachment", contentId: null, size: 29 },
      ],
      receivedAt: new Date(),
      createdAt: new Date(),
    });
    await new DrizzleMessageRepository(drizzle(pool, { schema })).insert(message);
    objects.set(rawKey, sampleEml());
  });

  it("baixa o .eml como arquivo, sem o navegador poder abrir nem adivinhar o tipo", async () => {
    const response = await get(raw, keys.ana, { id: message.id });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("message/rfc822");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="Pedido-1042-confirmado.eml"/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toMatch(/^sandbox/);
    expect(await response.text()).toContain("Subject: Pedido 1042 confirmado");
  });

  it("devolve os cabeçalhos do email original", async () => {
    const response = await get(headers, keys.ana, { id: message.id });
    const body = (await response.json()) as { headers: { name: string; value: string }[] };

    expect(body.headers).toContainEqual({ name: "Subject", value: "Pedido 1042 confirmado" });
  });

  it("extrai o anexo do .eml", async () => {
    const response = await get(attachment, keys.ana, { id: message.id, index: "0" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/filename="nota-fiscal-1042.pdf"/);
    expect(await response.text()).toBe("%PDF-1.4 nota fiscal de teste");
  });

  it("outro Membro recebe 404 nas três rotas", async () => {
    for (const [handler, params] of [
      [raw, { id: message.id }],
      [headers, { id: message.id }],
      [attachment, { id: message.id, index: "0" }],
    ] as const) {
      const response = await get(handler, keys.bruno, params);
      expect(response.status).toBe(404);
    }
  });

  it("anexo fora da lista dá 404 e posição inválida dá 400", async () => {
    expect((await get(attachment, keys.ana, { id: message.id, index: "3" })).status).toBe(404);
    expect((await get(attachment, keys.ana, { id: message.id, index: "-1" })).status).toBe(400);
  });

  it("se o .eml sumiu do R2, responde no_raw", async () => {
    objects.clear();

    const response = await get(raw, keys.ana, { id: message.id });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "no_raw" });
  });
});
