// @vitest-environment node
// O conector do claude.ai de ponta a ponta, sem rede externa: o app como
// servidor OAuth (authorize → consentimento → token, com PKCE) e o MCP
// aceitando o token. Postgres de verdade; só roda com TEST_DATABASE_URL.
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createIsolatedDatabase } from "@/shared/db/isolatedDatabase";
import { runMigrations } from "@/shared/db/migrate";

const current = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => current.headers }));

const url = process.env.TEST_DATABASE_URL;
const SECRET = "segredo-so-de-teste-com-32-caracteres!!";
const REDIRECT = "https://cliente.example/callback";

type Auth = ReturnType<typeof import("@/modules/membership/infrastructure/auth").getAuth>;

describe.skipIf(!url)("MCP com token OAuth (Postgres real)", () => {
  const saved: Record<string, string | undefined> = {};
  let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
  let pool: Pool;
  let server: http.Server;
  let base: string;
  let auth: Auth;
  let POST: (request: Request) => Promise<Response>;
  let clientId: string;

  const cookieFor = (token: string) =>
    `better-auth.session_token=${encodeURIComponent(`${token}.${crypto.createHmac("sha256", SECRET).update(token).digest("base64")}`)}`;

  /** O caminho de um cliente MCP: authorize → consentimento → token. */
  async function obtainToken(sessionToken: string, scope = "tempmail offline_access") {
    const cookie = cookieFor(sessionToken);
    const verifier = crypto.randomBytes(32).toString("base64url");
    const authorize = new URL(`${base}/api/auth/oauth2/authorize`);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      scope,
      resource: `${base}/api/mcp`,
      state: "estado",
    })) {
      authorize.searchParams.set(key, value);
    }

    const started = await auth.handler(new Request(authorize, { headers: { cookie } }));
    const location =
      started.status === 302 ? started.headers.get("location") : started.status === 200 ? (await started.json()).url : null;
    if (!location) return { stage: "authorize", status: started.status, body: await started.text() };
    let next = new URL(location, base);

    if (next.pathname === "/consentir") {
      const consent = await auth.handler(
        new Request(`${base}/api/auth/oauth2/consent`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json", origin: base },
          body: JSON.stringify({ accept: true, oauth_query: next.search.slice(1) }),
        }),
      );
      if (consent.status !== 200) return { stage: "consent", status: consent.status, body: await consent.text() };
      next = new URL((await consent.json()).url);
    }

    const token = await auth.handler(
      new Request(`${base}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: next.searchParams.get("code") ?? "",
          redirect_uri: REDIRECT,
          client_id: clientId,
          code_verifier: verifier,
          resource: `${base}/api/mcp`,
        }),
      }),
    );
    return { stage: "token", status: token.status, body: (await token.json()) as Record<string, string> };
  }

  const callMcp = (accessToken: string | null, body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) => {
    const request = new Request(`${base}/api/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    current.headers = request.headers;
    return POST(request);
  };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(url!);
    pool = new Pool({ connectionString: isolated.url });
    await runMigrations(pool, path.join(process.cwd(), "drizzle"));

    // Um servidor de verdade só para o /jwks: o MCP valida o token buscando as chaves públicas.
    server = http.createServer(async (req, res) => {
      const response = await auth.handler(new Request(`${base}${req.url}`, { method: req.method }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const env: Record<string, string> = {
      DATABASE_URL: isolated.url,
      BETTER_AUTH_URL: base,
      BETTER_AUTH_SECRET: SECRET,
      GITHUB_CLIENT_ID: "teste",
      GITHUB_CLIENT_SECRET: "teste",
      ALLOWED_GITHUB_USERS: "ana,bruno",
      OAUTH_JWKS_URL: `${base}/api/auth/jwks`,
    };
    for (const [name, value] of Object.entries(env)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
    delete (globalThis as { __tempmailLimiter?: unknown }).__tempmailLimiter;

    auth = (await import("@/modules/membership/infrastructure/auth")).getAuth();
    ({ POST } = await import("./route"));

    for (const id of ["ana", "bruno"]) {
      await pool.query('insert into "user" (id, name, email, github_username) values ($1, $1, $2, $1)', [
        id,
        `${id}@example.test`,
      ]);
      await pool.query(
        "insert into session (id, expires_at, token, created_at, updated_at, user_id) values ($1, now() + interval '1 day', $2, now(), now(), $3)",
        [`s-${id}`, `sessao-${id}-0123456789abcdef`, id],
      );
    }
    // Um cliente público como o que o CIMD do claude.ai cria, ligado ao recurso /api/mcp.
    clientId = "cliente-de-teste";
    await pool.query(
      `insert into oauth_client (id, client_id, name, scopes, redirect_uris, token_endpoint_auth_method, grant_types, response_types, disabled, created_at, updated_at)
       values ('c1', $1, 'Cliente de teste', $2, $3, 'none', $4, $5, false, now(), now())`,
      [clientId, ["openid", "profile", "offline_access", "tempmail"], [REDIRECT], ["authorization_code", "refresh_token"], ["code"]],
    );
    await pool.query(
      `insert into oauth_resource (id, identifier, name, created_at, updated_at) values ('r1', $1, $1, now(), now())
       on conflict (identifier) do nothing`,
      [`${base}/api/mcp`],
    );
    await pool.query(
      "insert into oauth_client_resource (id, client_id, resource_id, created_at) values ('cr1', $1, $2, now())",
      [clientId, `${base}/api/mcp`],
    );
  });

  afterAll(async () => {
    const globals = globalThis as { __tempmailPool?: { end(): Promise<void> } };
    await globals.__tempmailPool?.end();
    delete globals.__tempmailPool;
    await new Promise((resolve) => server?.close(resolve));
    await pool?.end();
    await isolated?.drop();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  beforeEach(() => {
    process.env.ALLOWED_GITHUB_USERS = "ana,bruno";
  });

  it("sem credencial, responde 401 apontando para os metadados do recurso", async () => {
    const response = await callMcp(null);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${base}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });

  it("autoriza, troca o código por um token preso ao /api/mcp e usa as ferramentas", async () => {
    const result = await obtainToken("sessao-ana-0123456789abcdef");
    expect(result).toMatchObject({ stage: "token", status: 200 });
    const tokens = result.body as Record<string, string>;
    const claims = JSON.parse(Buffer.from(tokens.access_token.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ sub: "ana", aud: `${base}/api/mcp`, azp: clientId });
    expect(tokens.refresh_token).toBeTruthy();

    const listed = await callMcp(tokens.access_token);
    expect(listed.status).toBe(200);
    expect(await listed.text()).toContain("wait_for_email");

    const created = await callMcp(tokens.access_token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "create_inbox", arguments: { address: "via-oauth" } },
    });
    expect(await created.text()).toContain("via-oauth@");
    const owner = await pool.query("select owner_id from inbox where address = 'via-oauth'");
    expect(owner.rows[0].owner_id).toBe("ana");
  });

  it("quem sai da lista perde o acesso na hora, mesmo com o token ainda válido", async () => {
    const result = await obtainToken("sessao-bruno-0123456789abcdef");
    const token = (result.body as Record<string, string>).access_token;
    expect((await callMcp(token)).status).toBe(200);

    process.env.ALLOWED_GITHUB_USERS = "ana";

    const response = await callMcp(token);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "access_ended" });
  });

  it("quem está fora da lista não consegue autorizar", async () => {
    process.env.ALLOWED_GITHUB_USERS = "ana";

    const result = await obtainToken("sessao-bruno-0123456789abcdef");

    expect(result).toMatchObject({ stage: "authorize", status: 403 });
  });

  it("um token sem o escopo tempmail é recusado com o desafio de escopo", async () => {
    const result = await obtainToken("sessao-ana-0123456789abcdef", "openid profile");
    const token = (result.body as Record<string, string>).access_token;

    const response = await callMcp(token);

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain("insufficient_scope");
  });

  it("um token assinado por outro lado é recusado", async () => {
    const forged = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: "ana", aud: `${base}/api/mcp`, scope: "tempmail" })).toString("base64url"),
      "assinatura",
    ].join(".");

    expect((await callMcp(forged)).status).toBe(401);
  });

  it("a Chave de API continua funcionando", async () => {
    const { composeApiKeyUseCases } = await import("@/composition/apiKeys");
    const created = await composeApiKeyUseCases().create.execute({ memberId: "ana", name: "teste" });
    if (!created.ok) throw new Error();

    expect((await callMcp(created.value.token)).status).toBe(200);
  });
});
