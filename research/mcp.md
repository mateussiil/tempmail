# Servidor MCP remoto em Next.js 16 (App Router) no Coolify, com API key por usuário

Pesquisa feita em 2026-11-04. Fontes citadas inline. Onde a fonte é blog/issue (não doc oficial), está marcado como **[secundária]**.

---

## 1. Contexto do protocolo (o que mudou em 2026)

- A versão **atual** da spec MCP é **2026-07-28** (https://modelcontextprotocol.io/specification/versioning).
- Mudanças relevantes pra nós (https://modelcontextprotocol.io/specification/2026-07-28/changelog):
  - **Stateless de verdade**: sem `Mcp-Session-Id`, sem handshake `initialize`. Cada request leva versão + capabilities no `_meta`. Estado entre chamadas = **handles explícitos passados como argumento de tool** (ex.: `inbox_id`). Isso casa perfeitamente com um serviço de e-mail temporário.
  - Novo RPC obrigatório `server/discover`.
  - GET do endpoint e `resources/subscribe` saem; entra `subscriptions/listen` (stream POST longo, opt-in).
  - `notifications/progress` continua existindo e flui **no stream de resposta da própria request** (`tools/call`).
  - **Sem resumabilidade de SSE**: se o stream cair, a request em andamento se perde e o cliente precisa reenviar. Relevante pra `wait_for_email` longo.
  - **Tasks** saíram do core e viraram extensão oficial `io.modelcontextprotocol/tasks` (polling via `tasks/get`).
  - POST precisa dos headers `Mcp-Method` e `Mcp-Name` (o SDK cuida disso).
  - DCR (Dynamic Client Registration) foi **deprecado** em favor de **CIMD** (Client ID Metadata Documents) para OAuth.
- Clientes 2025-era (Streamable HTTP com sessão) ainda existem no mercado; o servidor deve aceitar os dois. `mcp-handler@2` faz isso com fallback stateless (abaixo).

## 2. Qual biblioteca

### Opção A (recomendada): `mcp-handler@^2` (Vercel)
- Repo: https://github.com/vercel/mcp-handler — changelog: https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler (30/07/2026).
- O antigo `@vercel/mcp-adapter` foi renomeado para `mcp-handler`; a linha 2.x é a atual.
- Depende de `@modelcontextprotocol/server@^2` (SDK oficial v2), `zod@^4`, Node 20+.
- `createMcpHandler` devolve um handler **Web-standard `(Request) => Promise<Response>`**: não depende da Vercel. Documentado também para Nuxt, SvelteKit, Hono. Roda em qualquer `next start` / `output: "standalone"` em Docker.
- **Stateless**: serve 2026-07-28 sem sessão; clientes 2025 caem no modo stateless do SDK (GET/DELETE de sessão → 405).
- **Sem Redis** (o Redis da 1.x era só para o transporte HTTP+SSE legado, removido na 2.x; `/sse` e `/message` → 410).
- `basePath`, `maxDuration`, `redisUrl`, `sessionIdGenerator` foram removidos; você só monta o handler na rota que quiser.
- Auth: `withMcpAuth(handler, verifyToken, { required, requiredScopes, resourceMetadataPath })` + `protectedResourceHandler({ authServerUrls })` para RFC 9728 (https://github.com/vercel/mcp-handler/blob/main/docs/AUTHORIZATION.md). `verifyToken(req, bearerToken)` retorna `AuthInfo | undefined`; o resultado chega na tool como `ctx.http?.authInfo`.

### Opção B: SDK oficial direto (`@modelcontextprotocol/server` v2)
- `WebStandardStreamableHTTPServerTransport` funciona com Request/Response Web e, portanto, com Route Handlers (https://ts.sdk.modelcontextprotocol.io/v2/classes/_modelcontextprotocol_server.server_streamableHttp.WebStandardStreamableHTTPServerTransport.html).
- Mais código de cola (auth, 401, metadata), sem ganho real para o nosso caso. Útil só se quiser controle fino do stream.
- Exemplo comunitário (v1) mostra cuidados: `export const runtime = "nodejs"` (SDK não roda em Edge), `dynamic = "force-dynamic"` **[secundária]** https://glama.ai/mcp/servers/TLiu2014/nextjs-mcp-streamable-http/tree.

### Outros
- `xmcp`, FastMCP (TS), etc. existem, mas para um app Next.js já existente `mcp-handler` é o caminho de menor atrito. Clerk/Better Auth/WorkOS têm integrações prontas de OAuth com `mcp-handler` (ex.: https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server).

### Esqueleto (Next 16, App Router)

```ts
// app/api/mcp/route.ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler((server) => {
  server.registerTool("create_inbox", {
    description: "Cria uma caixa temporária e retorna endereço + inbox_id",
    inputSchema: z.object({ prefix: z.string().optional(), ttl_minutes: z.number().int().max(1440).optional() }),
  }, async (args, ctx) => {
    const userId = ctx.http?.authInfo?.extra?.userId as string;
    // ...
    return { content: [{ type: "text", text: JSON.stringify(inbox) }], structuredContent: inbox };
  });
  // ...demais tools
}, { serverInfo: { name: "tempmail", version: "1.0.0" } });

const verifyToken = async (_req: Request, bearer?: string) => {
  // aceita também X-API-Key para clientes que não mandam Authorization
  const key = bearer ?? _req.headers.get("x-api-key") ?? undefined;
  if (!key) return undefined;
  const row = await db.apiKey.findByHash(sha256(key)); // nunca guarde a key em claro
  if (!row || row.revokedAt) return undefined;
  return { token: key, clientId: row.id, scopes: ["mail"], extra: { userId: row.userId } };
};

const auth = withMcpAuth(handler, verifyToken, { required: true });
export { auth as GET, auth as POST, auth as DELETE };
```

Obs.: confira se a versão instalada de `withMcpAuth` repassa o request completo para ler `x-api-key`; se não, faça um wrapper próprio que normaliza `X-API-Key` → `Authorization: Bearer` antes de chamar o handler.

## 3. Autenticação: API key em header vs OAuth (spec MCP)

### O que a spec diz
- A autorização na spec é **OAuth 2.1** opcional: servidor responde `401` com `WWW-Authenticate: Bearer resource_metadata="..."`, publica Protected Resource Metadata (RFC 9728), cliente descobre o Authorization Server, faz PKCE S256, registro via CIMD (preferido) ou DCR (deprecado). Tokens nunca na query string.
- Um bearer token estático é tecnicamente "um access token que você mesmo emitiu"; a spec não proíbe, só não define como o cliente o obtém.

### Suporte por cliente

| Cliente | Header estático (API key) | OAuth | Fonte |
|---|---|---|---|
| **Claude Code** | Sim: `claude mcp add --transport http tempmail https://mail.exemplo.com/api/mcp --header "Authorization: Bearer tm_xxx"` (`-H`/`-t` também). Em `.mcp.json`: `type: "http"` + `headers`. | Sim (`/mcp` → login no browser; `claude mcp login <nome>`; CIMD próprio + redirect loopback em qualquer porta) | https://code.claude.com/docs/en/mcp ; https://claude.com/docs/connectors/building/authentication |
| **claude.ai / Desktop / mobile (custom connector)** | **Beta, para um conjunto limitado de organizações**: "No sign-in" + seção *Request headers* (`authorization`, `x-api-key`, `x-auth-token`; até 4 headers; valor enviado literalmente, inclua `Bearer `). Não dá pra editar depois, só remover e re-adicionar. Anthropic diz explicitamente: é **credencial da organização, não da pessoa**, "se cada pessoa precisa entrar com a própria conta, use OAuth". Em plano individual (Pro/Max) a "org" é a própria pessoa, então funciona por usuário **se** a conta tiver acesso ao beta. | Sim, caminho padrão e garantido: CIMD (recomendado), DCR, ou client próprio. Callback `https://claude.ai/api/mcp/auth_callback`. Exige `401` (não aceita `WWW-Authenticate` em 200), usa só o 1º `authorization_servers`, endpoints OAuth com timeout de 10 s. Egress da Anthropic: `160.79.104.0/21`. | https://claude.com/docs/connectors/custom ; https://claude.com/docs/connectors/building/authentication |
| **Cursor** | Sim: `~/.cursor/mcp.json` → `{ "mcpServers": { "tempmail": { "url": "...", "headers": { "Authorization": "Bearer ${env:TEMPMAIL_KEY}" } } } }` | Sim: DCR, ou `auth.CLIENT_ID`/`CLIENT_SECRET` estático; PKCE; lê RFC 9728. Redirects `https://www.cursor.com/agents/mcp/oauth/callback` e `http://localhost:8787/callback`. | https://cursor.com/docs/context/mcp |

**Conclusão de auth**: API key em header cobre Claude Code, Cursor, VS Code e a maioria dos clientes de dev. Para claude.ai de forma **garantida e por usuário**, é preciso OAuth. Estratégia em duas fases:
1. **Agora**: aceitar `Authorization: Bearer <api_key>` (e `X-API-Key`). Nunca aceitar `?token=` na URL (Anthropic proíbe explicitamente).
2. **Depois (para claude.ai)**: adicionar um Authorization Server mínimo no próprio app (ou Better Auth/Clerk/WorkOS) cujo access token mapeia para o mesmo `userId`. O `verifyToken` aceita os dois formatos (prefixo `tm_` = API key, senão = JWT/opaque OAuth). Suportar CIMD (`client_id_metadata_document_supported: true` + `"none"` em `token_endpoint_auth_methods_supported`) e DCR por compatibilidade. Truque comum: a tela de consentimento OAuth é o login normal do app; o token emitido é escopado ao usuário.

## 4. Desenhando `wait_for_email(inbox, timeout)`

### Limites reais dos clientes
- **Claude Code** (https://code.claude.com/docs/en/mcp):
  - Timeout de wall-clock da tool: `MCP_TOOL_TIMEOUT` (padrão ~28 h) ou `timeout` por servidor no `.mcp.json`. Progress **não** estende o wall-clock.
  - Timer por request HTTP até o **primeiro byte**: max(60 s, timeout da tool, `MCP_TIMEOUT`).
  - **Idle timeout** `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`: **5 min** para HTTP/connector sem resposta *e sem progress*. **Progress reseta o idle** → é assim que se mantém uma chamada longa viva.
  - Saída: aviso >10k tokens, corte em 25k (`MAX_MCP_OUTPUT_TOKENS`); texto >50k chars vai para arquivo. Importa para `get_message` com HTML grande.
- **claude.ai / Desktop (connectors)**: sem número oficial publicado. Relatos de ~4 min de wall-clock não configurável no Desktop e quedas em ~60 s **[secundária]** (https://github.com/anthropics/claude-code/issues/64614, https://claudeissues.com/issue/49910-bug-remote-mcp-tool-calls-dropped-at-60s-client-side-despite-server-responding-i).
- **Cursor**: doc não cita timeout; relatos de ~60 s fixo em alguns caminhos, progress não estende **[secundária]** (https://forum.cursor.com/t/agent-acp-mcp-tools-call-times-out-at-60s-with-no-way-to-configure-it/163925/5).
- Outros hosts (OpenAI etc.) também relatam ~60 s e progress não resetando **[secundária]** (https://community.openai.com/t/call-remote-mcp-server-tool-timed-out-resulting-in-error-424/1364167).

### Limites da infra (Coolify)
- Coolify usa **Traefik** como proxy. Defaults v3: `readTimeout` 60 s (leitura do *request*), `writeTimeout` 0, `idleTimeout` 180 s (https://doc.traefik.io/traefik/v3.4/routing/entrypoints/). Para resposta SSE que envia bytes periodicamente não deve haver corte, mas **teste** e, se preciso, aumente `idleTimeout` no entrypoint.
- Next.js self-hosted (`next start`/standalone) não tem `maxDuration` como na Vercel; o limite é o processo Node. Garanta que nada bufferize o stream (compressão do Next/proxy pode segurar SSE; envie progress periódico para forçar flush; header `X-Accel-Buffering: no` se houver nginx).
- Sem resumabilidade na spec 2026: se o stream cair, a chamada é perdida → a tool tem que ser **idempotente** e não "consumir" e-mail ao esperar.

### Desenho recomendado
```
wait_for_email({
  inbox_id: string,
  timeout_seconds?: number = 45,     // clamp no servidor: 1..120
  since?: string,                    // ISO ou message_id; só conta e-mails depois disso (default: agora)
  from_contains?: string,
  subject_contains?: string,
}) -> { status: "received", message: {id, from, subject, received_at, preview, codes[]} }
   | { status: "timeout", waited_seconds, hint: "chame de novo com since=<cursor>" , cursor }
```
Regras:
1. **Timeout default curto (~45 s) e teto ~120 s**, abaixo do pior cliente observado (60 s em alguns). Timeout **não é erro**: retorna `status: "timeout"` com `cursor` e instrução textual para o modelo chamar de novo. Isso funciona em qualquer cliente, mesmo nos que ignoram progress.
2. **Enviar `notifications/progress` a cada ~10–15 s** quando o cliente mandou `progressToken` (via `ctx`/`extra.sendNotification` no SDK). Mantém Claude Code longe do idle timeout de 5 min, gera bytes no stream (anti-buffer/proxy) e dá feedback na UI.
3. **Implementação server-side sem polling pesado**: o handler de SMTP/ingest publica num canal (Postgres `LISTEN/NOTIFY`, Redis pub/sub ou um `EventEmitter` em memória se for uma réplica só). `wait_for_email` primeiro checa o banco (e-mail pode já ter chegado — evita race), depois assina o canal com `AbortSignal` do request + timer. Se o cliente cancelar (`notifications/cancelled` / abort do request), limpe o listener.
4. **Filtro `since`** e casamento por remetente/assunto, para não retornar o e-mail errado em fluxos com vários e-mails.
5. **Já retornar códigos extraídos** (`codes[]`) no resultado, para economizar uma chamada (`extract_code` vira opcional).
6. Para esperas muito longas (minutos), oferecer o padrão **job/polling**: `create_inbox` já é o handle; o modelo chama `list_messages(since=cursor)` periodicamente. A extensão oficial de Tasks (`io.modelcontextprotocol/tasks`) é o caminho "correto" futuro, mas suporte dos clientes ainda é incerto — não depender dela agora.

## 5. Lista de tools sugerida

Todas recebem/retornam handles explícitos (alinhado à spec stateless) e retornam `structuredContent` + texto curto. Todas escopadas ao `userId` do token.

| Tool | Entrada | Saída | Notas |
|---|---|---|---|
| `create_inbox` | `prefix?`, `domain?`, `ttl_minutes?` | `inbox_id`, `address`, `expires_at` | Annotation: não destrutiva. |
| `list_inboxes` | `include_expired?` | lista `{inbox_id, address, message_count, expires_at}` | `readOnlyHint: true`. |
| `list_messages` | `inbox_id`, `since?`, `limit?=20` | `{id, from, subject, received_at, preview}[]`, `cursor` | Sem corpo completo (economiza tokens). |
| `get_message` | `message_id`, `format?: "text"\|"html"\|"raw"` (default `text`), `max_chars?` | headers, texto, links, anexos (metadados) | Truncar; HTML convertido para texto por padrão (limite 25k tokens do Claude Code). Marcar conteúdo como não confiável (prompt injection vindo do e-mail). |
| `wait_for_email` | ver seção 4 | `received` \| `timeout` + `cursor` | Peça central. |
| `extract_code` | `message_id` ou `inbox_id` (último), `pattern?`, `length?` | `codes[]`, `links[]` (magic links / verificação) | Regex de OTP 4–8 dígitos + heurísticas ("code", "código", "verification"). |
| `delete_inbox` | `inbox_id` | `{deleted: true}` | `destructiveHint: true`. |

Extras úteis: `delete_message`, `get_attachment` (retornar como resource/link assinado em vez de base64 gigante), `send_test_email` (para dev).

Também vale definir `tools/list` em ordem determinística (spec 2026 pede) e `ttlMs`/`cacheScope: "private"` (o SDK v2 deve preencher).

## 6. Checklist de deploy no Coolify
- Dockerfile com `output: "standalone"`, Node 20+; rota em `app/api/mcp/route.ts` com `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- HTTPS no domínio (Traefik/Let's Encrypt do Coolify). claude.ai exige HTTPS; se usar allowlist, liberar `160.79.104.0/21`.
- Se mais de uma réplica: pub/sub externo (Postgres NOTIFY/Redis) para `wait_for_email`; o MCP em si é stateless e escala horizontal sem sticky session.
- Rate limit por API key; keys armazenadas como hash; prefixo identificável (`tm_live_...`) para secret scanning.
- Testar com `npx @modelcontextprotocol/inspector` e com `claude mcp add --transport http ... --header ...`.

## 7. Recomendação

1. Use **`mcp-handler@^2` + `@modelcontextprotocol/server@^2`** num Route Handler `app/api/mcp/route.ts` (runtime Node). É Web-standard, roda fora da Vercel em Docker/Coolify, é stateless (spec 2026-07-28 + fallback para clientes 2025) e não precisa de Redis.
2. **Auth fase 1: API key por usuário em `Authorization: Bearer`** (aceitar também `X-API-Key`), validada em `verifyToken` → `userId`. Cobre Claude Code (`--header`), Cursor (`headers` + `${env:...}`) e claude.ai **apenas** onde o beta de *Request headers* estiver liberado.
3. **Auth fase 2: OAuth (CIMD + DCR, PKCE S256, RFC 9728)** emitindo tokens para o mesmo usuário, se claude.ai/Desktop/mobile for público-alvo — é o único caminho garantido e "por pessoa" lá. Desenhe o `verifyToken` desde já para aceitar os dois tipos de token.
4. **`wait_for_email`**: long-poll curto (default 45 s, teto 120 s), progress a cada ~10–15 s, retorno `timeout` não-erro com `cursor` para re-chamada, checagem do banco antes de assinar o pub/sub, e códigos já extraídos no resultado. Não depender de Tasks ainda.
5. Tools: `create_inbox`, `list_inboxes`, `list_messages`, `get_message`, `wait_for_email`, `extract_code`, `delete_inbox` — com handles explícitos, saída enxuta e anotações read-only/destructive.

## Fontes
- https://modelcontextprotocol.io/specification/versioning
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://github.com/vercel/mcp-handler
- https://github.com/vercel/mcp-handler/blob/main/docs/AUTHORIZATION.md
- https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler
- https://ts.sdk.modelcontextprotocol.io/v2/classes/_modelcontextprotocol_server.server_streamableHttp.WebStandardStreamableHTTPServerTransport.html
- https://code.claude.com/docs/en/mcp
- https://claude.com/docs/connectors/custom
- https://claude.com/docs/connectors/building/authentication
- https://cursor.com/docs/context/mcp
- https://clerk.com/docs/nextjs/guides/ai/mcp/build-mcp-server
- https://doc.traefik.io/traefik/v3.4/routing/entrypoints/
- [secundária] https://workos.com/blog/mcp-stateless-spec-2026-07-28
- [secundária] https://github.com/anthropics/claude-code/issues/64614
- [secundária] https://claudeissues.com/issue/49910-bug-remote-mcp-tool-calls-dropped-at-60s-client-side-despite-server-responding-i
- [secundária] https://forum.cursor.com/t/agent-acp-mcp-tools-call-times-out-at-60s-with-no-way-to-configure-it/163925/5
- [secundária] https://community.openai.com/t/call-remote-mcp-server-tool-timed-out-resulting-in-error-424/1364167
- [secundária] https://glama.ai/mcp/servers/TLiu2014/nextjs-mcp-streamable-http/tree
