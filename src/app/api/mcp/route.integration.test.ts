// @vitest-environment node
// Fluxo completo do MCP pela rota: Chave de API de verdade, lista de autorizados,
// limite por chave e Postgres de verdade (inclusive o LISTEN/NOTIFY). Só roda
// com TEST_DATABASE_URL (o CI define), num banco descartável só dele.
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Message } from "@/modules/message/domain/Message";
import { DrizzleMessageRepository } from "@/modules/message/infrastructure/DrizzleMessageRepository";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";
import * as schema from "@/shared/db/schema";

// A rota lê os cabeçalhos por `next/headers`, que só existe dentro do Next.
const current = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => current.headers }));

const url = process.env.TEST_DATABASE_URL;
const RATE_LIMIT = 4;

const ENV: Record<string, string> = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "segredo-so-de-teste-com-32-caracteres!!",
  GITHUB_CLIENT_ID: "teste",
  GITHUB_CLIENT_SECRET: "teste",
  ALLOWED_GITHUB_USERS: "ana,bruno",
  API_RATE_LIMIT_PER_MINUTE: String(RATE_LIMIT),
  MAIL_DOMAIN: "tmp.exemplo.test",
};

type Rpc = { id?: number; method?: string; result?: Record<string, unknown>; error?: unknown };

describe.skipIf(!url)("POST /api/mcp (Postgres real)", () => {
  const saved: Record<string, string | undefined> = {};
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let messages: DrizzleMessageRepository;
  let POST: (request: Request) => Promise<Response>;
  let createKey: (memberId: string) => Promise<string>;
  let nextId = 1;

  const request = (body: unknown, headers: Record<string, string> = {}) => {
    const req = new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    });
    current.headers = req.headers;
    return req;
  };

  const readRpc = async (response: Response): Promise<Rpc[]> => {
    const text = await response.text();
    if (!response.headers.get("content-type")?.includes("text/event-stream")) return [JSON.parse(text)];
    return text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
  };

  const callTool = async (key: string, name: string, args: Record<string, unknown>, progressToken?: string) => {
    const response = await POST(
      request(
        {
          jsonrpc: "2.0",
          id: nextId++,
          method: "tools/call",
          params: { name, arguments: args, ...(progressToken ? { _meta: { progressToken } } : {}) },
        },
        { authorization: `Bearer ${key}` },
      ),
    );
    expect(response.status).toBe(200);
    const rpc = await readRpc(response);
    const result = rpc.find((m) => m.id !== undefined)!.result as {
      isError?: boolean;
      structuredContent: Record<string, unknown>;
    };
    return { result, notifications: rpc.filter((m) => m.id === undefined) };
  };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    messages = new DrizzleMessageRepository(drizzle(pool, { schema }));

    for (const [name, value] of Object.entries({ ...ENV, DATABASE_URL: isolated.url })) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
    // O limitador é um só por processo: recomeça com o limite deste teste.
    delete (globalThis as { __tempmailLimiter?: unknown }).__tempmailLimiter;

    ({ POST } = await import("./route"));
    const { composeApiKeyUseCases } = await import("@/composition/apiKeys");
    createKey = async (memberId) => {
      const created = await composeApiKeyUseCases().create.execute({ memberId, name: "mcp" });
      if (!created.ok) throw new Error("não criou a chave");
      return created.value.token;
    };
  });

  afterAll(async () => {
    const globals = globalThis as {
      __tempmailNewMessageSignal?: { close(): Promise<void> };
      __tempmailPool?: { end(): Promise<void> };
    };
    await globals.__tempmailNewMessageSignal?.close();
    await globals.__tempmailPool?.end();
    delete globals.__tempmailNewMessageSignal;
    delete globals.__tempmailPool;
    await pool?.end();
    await isolated?.drop();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  beforeEach(async () => {
    process.env.ALLOWED_GITHUB_USERS = ENV.ALLOWED_GITHUB_USERS;
    await pool.query('truncate "message", "api_key", "inbox", "session", "account", "user" cascade');
    for (const id of ["ana", "bruno"]) {
      await pool.query('insert into "user" (id, name, email, github_username) values ($1, $1, $2, $1)', [
        id,
        `${id}@example.test`,
      ]);
    }
  });

  it("sem credencial responde 401 com o desafio do OAuth, sem cair para a sessão", async () => {
    const response = await POST(request({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(
      /^Bearer resource_metadata="http:\/\/localhost:3000\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
    );
  });

  it("chave inválida responde 401", async () => {
    const response = await POST(
      request({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, { "x-api-key": "tm_nao-existe" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_api_key" });
  });

  it("aceita X-API-Key e lista as ferramentas", async () => {
    const key = await createKey("ana");

    const response = await POST(
      request({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, { "x-api-key": key }),
    );

    const [rpc] = await readRpc(response);
    expect((rpc.result!.tools as { name: string }[]).map((t) => t.name)).toContain("wait_for_email");
  });

  it("cria uma Caixa, espera o email e recebe o código; a espera longa conta como um pedido só", async () => {
    const key = await createKey("ana");

    const created = await callTool(key, "create_inbox", { address: "cadastro" });
    const inbox = created.result.structuredContent.inbox as { id: string; fullAddress: string };
    expect(inbox.fullAddress).toBe("cadastro@tmp.exemplo.test");

    const pending = callTool(key, "wait_for_email", { inbox_id: inbox.id, timeout_seconds: 20 }, "p1");
    await new Promise((r) => setTimeout(r, 300));
    const now = new Date();
    await messages.insert(
      Message.ready({
        inboxId: inbox.id,
        emailId: "email-1",
        messageId: null,
        fromAddress: "noreply@exemplo.test",
        fromHeader: null,
        subject: "Seu código de verificação",
        textBody: "Use o código 771204",
        htmlBody: null,
        rawKey: null,
        rawSize: null,
        attachments: [],
        receivedAt: now,
        createdAt: now,
      }),
    );
    const waited = await pending;

    expect(waited.result.structuredContent).toMatchObject({
      status: "received",
      message: { verificationCode: "771204", subject: "Seu código de verificação" },
    });

    // create_inbox + wait_for_email = 2 pedidos; cabem mais 2 no minuto (limite 4).
    await callTool(key, "list_inboxes", {});
    await callTool(key, "list_inboxes", {});
    const limited = await POST(
      request({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} }, { authorization: `Bearer ${key}` }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("uma espera sem email devolve timeout, sem erro", async () => {
    const key = await createKey("ana");
    const created = await callTool(key, "create_inbox", {});
    const inbox = created.result.structuredContent.inbox as { id: string };

    const { result } = await callTool(key, "wait_for_email", { inbox_id: inbox.id, timeout_seconds: 1 });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ status: "timeout" });
  });

  it("um Membro não enxerga as Caixas do outro", async () => {
    const ana = await createKey("ana");
    const bruno = await createKey("bruno");
    const created = await callTool(ana, "create_inbox", {});
    const inbox = created.result.structuredContent.inbox as { id: string };

    const list = await callTool(bruno, "list_inboxes", { include_expired: true });
    expect(list.result.structuredContent).toEqual({ inboxes: [] });

    const messagesOfAna = await callTool(bruno, "list_messages", { inbox_id: inbox.id });
    expect(messagesOfAna.result.structuredContent).toMatchObject({ error: "not_found" });
  });

  it("tirar o Membro da lista de autorizados corta a chave dele na hora", async () => {
    const key = await createKey("bruno");
    process.env.ALLOWED_GITHUB_USERS = "ana";

    const response = await POST(
      request({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, { authorization: `Bearer ${key}` }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "access_ended" });
  });
});
