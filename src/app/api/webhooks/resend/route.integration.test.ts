// @vitest-environment node
// Fluxo completo do webhook: assinatura verdadeira (Svix), Postgres de verdade, e
// o Resend e o R2 simulados por servidores locais. Só roda com TEST_DATABASE_URL
// (o CI define). Cria um banco descartável só dele, então o banco da URL não é alterado.
import path from "node:path";
import { Pool } from "pg";
import { Webhook } from "svix";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { composeMessageReaders } from "@/composition/receiving";
import { Message } from "@/modules/message/domain/Message";
import { startStubServer } from "@/modules/message/testing/stubServer";
import { getPool } from "@/shared/db/client";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";

const url = process.env.TEST_DATABASE_URL;

const SECRET = `whsec_${Buffer.from("segredo-do-webhook-de-teste-32b!").toString("base64")}`;
const ENV_KEYS = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "RESEND_API_URL",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "MAIL_DOMAIN",
  "MAX_MESSAGE_MB",
] as const;

type ApiAnswer = { status: number; body: unknown };

describe.skipIf(!url)("POST /api/webhooks/resend (Postgres real; Resend e R2 simulados)", () => {
  const saved: Record<string, string | undefined> = {};
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let resend: Awaited<ReturnType<typeof startStubServer>>;
  let r2: Awaited<ReturnType<typeof startStubServer>>;
  let POST: (request: Request) => Promise<Response>;

  /** O que a API simulada do Resend responde, por id de email. */
  const emails = new Map<string, ApiAnswer>();
  /** O `.eml` que o link de download devolve, por id. */
  const raws = new Map<string, Buffer>();

  const apiEmail = (id: string, overrides: Record<string, unknown> = {}) => ({
    object: "email",
    id,
    from: "noreply@github.com",
    to: ["teste@tmp.exemplo.test"],
    created_at: "2026-11-05T12:00:00.000Z",
    subject: "Seu código de verificação",
    html: "<p>Use o código <b>482913</b></p>",
    text: "Use o código 482913",
    headers: { from: "GitHub <noreply@github.com>" },
    message_id: `<${id}@github.com>`,
    raw: { download_url: `${resend.url}/raw/${id}`, expires_at: "2026-11-05T13:00:00.000Z" },
    attachments: [],
    ...overrides,
  });

  const seedEmail = (id: string, overrides: Record<string, unknown> = {}, rawBytes?: Buffer) => {
    emails.set(id, { status: 200, body: apiEmail(id, overrides) });
    raws.set(id, rawBytes ?? Buffer.from(`From: noreply@github.com\r\nSubject: oi\r\n\r\ncorpo de ${id}`));
  };

  const event = (emailId: string, to: string[], overrides: Record<string, unknown> = {}) => ({
    type: "email.received",
    created_at: "2026-11-05T12:00:01.000Z",
    data: {
      email_id: emailId,
      created_at: "2026-11-05T12:00:00.000Z",
      from: "noreply@github.com",
      to,
      cc: [],
      bcc: [],
      received_for: to,
      message_id: `<${emailId}@github.com>`,
      subject: "Seu código de verificação",
      attachments: [],
      ...overrides,
    },
  });

  const webhook = (body: unknown | string, options: { secret?: string; at?: Date } = {}) => {
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    const at = options.at ?? new Date();
    const id = `msg_${Math.random().toString(36).slice(2)}`;
    const signature = new Webhook(options.secret ?? SECRET).sign(id, at, payload);
    return new Request("http://localhost/api/webhooks/resend", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": id,
        "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
        "svix-signature": signature,
      },
      body: payload,
    });
  };

  const call = async (request: Request) => {
    const response = await POST(request);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const resendCalls = () => resend.requests.filter((r) => r.url.startsWith("/emails/receiving/"));
  const r2Puts = () => r2.requests.filter((r) => r.method === "PUT");
  const messageCount = async () =>
    (await pool.query("select count(*)::int as n from message")).rows[0].n as number;

  beforeAll(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    isolated = await createIsolatedDatabase(url!);

    resend = await startStubServer((request) => {
      const raw = /^\/raw\/(.+)$/.exec(request.url);
      if (raw) {
        const bytes = raws.get(decodeURIComponent(raw[1]));
        return bytes ? { status: 200, body: bytes } : { status: 404 };
      }
      const api = /^\/emails\/receiving\/(.+)$/.exec(request.url);
      const answer = api ? emails.get(decodeURIComponent(api[1])) : undefined;
      if (!answer) return { status: 404, body: JSON.stringify({ name: "not_found" }) };
      return { status: answer.status, body: JSON.stringify(answer.body) };
    });
    r2 = await startStubServer(() => ({ status: 200, headers: { etag: '"stub"' } }));

    Object.assign(process.env, {
      DATABASE_URL: isolated.url,
      RESEND_API_KEY: "re_chave_de_teste",
      RESEND_WEBHOOK_SECRET: SECRET,
      RESEND_API_URL: resend.url,
      R2_ENDPOINT: r2.url,
      R2_ACCESS_KEY_ID: "chave-de-teste",
      R2_SECRET_ACCESS_KEY: "segredo-de-teste",
      R2_BUCKET: "tempmail",
      MAIL_DOMAIN: "tmp.exemplo.test",
    });
    delete process.env.MAX_MESSAGE_MB;

    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));
    ({ POST } = await import("./route"));
  });

  afterAll(async () => {
    await resend?.close();
    await r2?.close();
    await pool?.end();
    await getPool().end(); // o pool do próprio app, criado na primeira chamada
    await isolated?.drop();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  beforeEach(async () => {
    emails.clear();
    raws.clear();
    resend.requests.length = 0;
    r2.requests.length = 0;
    delete process.env.MAX_MESSAGE_MB;
    process.env.RESEND_API_KEY = "re_chave_de_teste";

    await pool.query('truncate "message", "inbox", "session", "account", "user" cascade');
    for (const id of ["ana", "bruno"]) {
      await pool.query(
        'insert into "user" (id, name, email, github_username) values ($1, $2, $3, $4)',
        [id, id, `${id}@example.test`, id],
      );
    }
    await pool.query(
      `insert into inbox (id, address, owner_id, expires_at) values
         ('inbox-teste', 'teste', 'ana', now() + interval '1 day'),
         ('inbox-outra', 'outra', 'bruno', null),
         ('inbox-velha', 'velha', 'ana', now() - interval '1 hour')`,
    );
  });

  it("guarda o .eml no R2 e os campos prontos, e a Mensagem aparece para o Dono", async () => {
    seedEmail("email-1");

    const { status, body } = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

    expect(status).toBe(200);
    expect(body).toEqual({ outcome: "stored" });

    const id = Message.idFor("email-1", "inbox-teste");
    const puts = r2Puts();
    expect(puts).toHaveLength(1);
    expect(new URL(puts[0].url, "http://stub").pathname).toBe(`/tempmail/caixas/inbox-teste/${id}.eml`);
    expect(puts[0].body.toString()).toBe("From: noreply@github.com\r\nSubject: oi\r\n\r\ncorpo de email-1");
    expect(puts[0].headers["content-type"]).toBe("message/rfc822");

    // O que o Dono vê pela API (casos de uso de leitura, com Postgres de verdade).
    const readers = composeMessageReaders();
    const list = await readers.list.execute({ ownerId: "ana", inboxId: "inbox-teste" });
    expect(list.ok && list.value).toEqual([
      {
        id,
        inboxId: "inbox-teste",
        from: "GitHub <noreply@github.com>",
        fromAddress: "noreply@github.com",
        subject: "Seu código de verificação",
        receivedAt: "2026-11-05T12:00:00.000Z",
        verificationCode: "482913",
        status: "ready",
        attachmentCount: 0,
      },
    ]);
    const detail = await readers.get.execute({ ownerId: "ana", messageId: id });
    expect(detail.ok && detail.value).toMatchObject({
      text: "Use o código 482913",
      html: "<p>Use o código <b>482913</b></p>",
      hasRaw: true,
    });

    // Outro Membro não vê nada.
    expect(await readers.get.execute({ ownerId: "bruno", messageId: id })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("guarda os metadados dos anexos que o Resend informa", async () => {
    seedEmail("email-1", {
      attachments: [
        { id: "att-1", filename: "nota.pdf", content_type: "application/pdf", content_disposition: null, content_id: null, size: 13264 },
      ],
    });

    await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

    const { rows } = await pool.query("select attachments from message");
    expect(rows[0].attachments).toEqual([
      { id: "att-1", filename: "nota.pdf", contentType: "application/pdf", contentDisposition: null, contentId: null, size: 13264 },
    ]);
  });

  it("reenviar o mesmo aviso não duplica, não busca de novo e não regrava no R2", async () => {
    seedEmail("email-1");
    const first = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

    const again = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

    expect(first.body).toEqual({ outcome: "stored" });
    expect(again).toEqual({ status: 200, body: { outcome: "duplicate" } });
    expect(await messageCount()).toBe(1);
    expect(resendCalls()).toHaveLength(1);
    expect(r2Puts()).toHaveLength(1);
  });

  it("descarta o email para endereço sem Caixa, e para Caixa expirada, sem tocar no Resend", async () => {
    seedEmail("email-1");

    const unknown = await call(webhook(event("email-1", ["ninguem@tmp.exemplo.test"])));
    const expired = await call(webhook(event("email-1", ["velha@tmp.exemplo.test"])));
    const otherDomain = await call(webhook(event("email-1", ["teste@outro.test"])));

    expect(unknown.body).toEqual({ outcome: "orphan" });
    expect(expired.body).toEqual({ outcome: "orphan" });
    expect(otherDomain.body).toEqual({ outcome: "not_for_us" });
    expect(await messageCount()).toBe(0);
    expect(resendCalls()).toHaveLength(0);
    expect(r2Puts()).toHaveLength(0);
  });

  it("com dois destinatários, grava uma Mensagem por Caixa e busca o email uma vez só", async () => {
    seedEmail("email-1");

    await call(webhook(event("email-1", ["teste@tmp.exemplo.test", "outra@tmp.exemplo.test"], { received_for: [] })));

    expect(await messageCount()).toBe(2);
    expect(resendCalls()).toHaveLength(1);
    expect(r2Puts()).toHaveLength(2);
  });

  describe("assinatura", () => {
    it("recusa assinatura de outro segredo, corpo alterado, aviso velho e cabeçalhos ausentes", async () => {
      seedEmail("email-1");
      const body = event("email-1", ["teste@tmp.exemplo.test"]);
      const otherSecret = `whsec_${Buffer.from("outro-segredo-do-webhook-de-teste").toString("base64")}`;

      const wrongSecret = await call(webhook(body, { secret: otherSecret }));

      const valid = webhook(body);
      const tampered = new Request(valid.url, {
        method: "POST",
        headers: valid.headers,
        body: JSON.stringify(event("email-1", ["outra@tmp.exemplo.test"])),
      });
      const old = await call(webhook(body, { at: new Date(Date.now() - 10 * 60_000) }));
      const unsigned = await call(
        new Request(valid.url, { method: "POST", body: JSON.stringify(body) }),
      );

      expect(wrongSecret).toEqual({ status: 400, body: { error: "invalid_signature" } });
      expect(await call(tampered)).toEqual({ status: 400, body: { error: "invalid_signature" } });
      expect(old).toEqual({ status: 400, body: { error: "invalid_signature" } });
      expect(unsigned).toEqual({ status: 400, body: { error: "invalid_signature" } });
      expect(await messageCount()).toBe(0);
      expect(resendCalls()).toHaveLength(0);
    });

    it("assinatura válida com corpo que não é JSON é invalid_payload", async () => {
      const { status, body } = await call(webhook("isto não é json"));

      expect(status).toBe(400);
      expect(body).toEqual({ error: "invalid_payload" });
    });
  });

  it("ignora, com 200, evento de outro tipo", async () => {
    const { status, body } = await call(webhook({ type: "email.sent", data: { email_id: "x" } }));

    expect(status).toBe(200);
    expect(body).toEqual({ ignored: "event_type", type: "email.sent" });
  });

  it("recusa, com 400, aviso verdadeiro mas sem id do email", async () => {
    const { status, body } = await call(webhook({ type: "email.received", data: { from: "a@b.test" } }));

    expect(status).toBe(400);
    expect(body).toEqual({ error: "invalid_payload" });
  });

  describe("conteúdo indisponível", () => {
    it("cota do Resend estourada: grava a Mensagem sem corpo, com o status certo", async () => {
      emails.set("email-1", { status: 403, body: { statusCode: 403, name: "email_above_quota", message: "acima da cota" } });

      const { status, body } = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

      expect(status).toBe(200);
      expect(body).toEqual({ outcome: "stored" });
      const { rows } = await pool.query("select status, subject, text_body, html_body, raw_key from message");
      expect(rows).toEqual([
        { status: "quota_exceeded", subject: "Seu código de verificação", text_body: null, html_body: null, raw_key: null },
      ]);
      expect(r2Puts()).toHaveLength(0);
    });

    it("acima do tamanho máximo: guarda só os metadados e nada no R2", async () => {
      process.env.MAX_MESSAGE_MB = "1";
      seedEmail("email-1", {}, Buffer.alloc(2 * 1024 * 1024, 65));

      const { body } = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

      expect(body).toEqual({ outcome: "stored" });
      const { rows } = await pool.query("select status, html_body, raw_key from message");
      expect(rows).toEqual([{ status: "too_large", html_body: null, raw_key: null }]);
      expect(r2Puts()).toHaveLength(0);
    });

    it("email que o Resend não conhece: 200, sem gravar nada", async () => {
      const { status, body } = await call(webhook(event("fantasma", ["teste@tmp.exemplo.test"])));

      expect(status).toBe(200);
      expect(body).toEqual({ outcome: "email_not_found" });
      expect(await messageCount()).toBe(0);
    });
  });

  describe("falhas passageiras", () => {
    it("Resend com erro 500: responde 503 sem gravar, e a nova tentativa funciona", async () => {
      emails.set("email-1", { status: 500, body: { name: "application_error" } });
      const request = event("email-1", ["teste@tmp.exemplo.test"]);

      const failed = await call(webhook(request));
      seedEmail("email-1"); // o Resend se recuperou
      const retried = await call(webhook(request));

      expect(failed).toEqual({ status: 503, body: { error: "temporarily_unavailable" } });
      expect(retried).toEqual({ status: 200, body: { outcome: "stored" } });
      expect(await messageCount()).toBe(1);
    });

    it("chave do Resend sem permissão (401): também responde 503, para o Resend reenviar depois", async () => {
      emails.set("email-1", { status: 401, body: { name: "restricted_api_key" } });

      const { status } = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

      expect(status).toBe(503);
      expect(await messageCount()).toBe(0);
    });

    it("link do .eml fora do ar: 503 sem gravar a Mensagem nem o arquivo", async () => {
      seedEmail("email-1");
      raws.delete("email-1"); // o link responde 404

      const { status } = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

      expect(status).toBe(503);
      expect(await messageCount()).toBe(0);
      expect(r2Puts()).toHaveLength(0);
    });
  });

  it("sem as variáveis do recebimento, responde 503 listando só os nomes que faltam", async () => {
    process.env.RESEND_API_KEY = "";

    const { status, body } = await call(webhook(event("email-1", ["teste@tmp.exemplo.test"])));

    expect(status).toBe(503);
    expect(body).toEqual({ error: "receiving_not_configured", missing: ["RESEND_API_KEY"] });
  });
});
