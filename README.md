# Tempmail

Email temporário para uso pessoal e do time: recebe emails catch-all em `tmp.mateussiil.com.br`, com página web, API REST e servidor MCP remoto.

O planejamento está no mapa: [[Mapa] Tempmail: email temporário com página, API e MCP](https://github.com/mateussiil/tempmail/issues/1). A linguagem do domínio está em [`CONTEXT.md`](./CONTEXT.md).

## Stack

Next.js (App Router) + TypeScript, Postgres com Drizzle, Vitest. Deploy no Coolify, por `Dockerfile`.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # ajuste DATABASE_URL
npm run dev
```

Scripts: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run db:generate` (gera uma migration em `drizzle/` a partir de `src/shared/db/schema.ts`).

As migrations rodam sozinhas quando o servidor sobe (`src/instrumentation-node.ts`), a menos que `RUN_MIGRATIONS=false`. Sem `DATABASE_URL` elas são puladas, o que mantém o build e o CI sem segredos.

## Arquitetura

Código organizado por módulo de negócio, cada um com quatro camadas, no padrão de [Arquitetura de frontend: organizando o caos](https://mateussiil.com.br/blog/arquitetura-de-frontend-organizando-o-caos/) ([exemplo](https://github.com/mateussiil/frontend-architecture-dashboard-example)):

```
src/
├── app/            # rotas do Next: só pontos de entrada, chamam casos de uso
├── composition/    # único lugar que liga implementações reais aos casos de uso
├── shared/         # config, banco e o que é comum a todos os módulos
└── modules/<modulo>/
    ├── domain/          # entidades e regras, sem saber de UI nem de HTTP
    ├── application/     # casos de uso e interfaces dos repositórios
    ├── infrastructure/  # implementações (Postgres, R2, Resend…)
    ├── ui/              # componentes de apresentação
    └── testing/         # repositórios falsos e fixtures
```

Regras: componentes recebem só o que precisam (nunca repositório nem configuração); os pontos de entrada chamam os casos de uso e preparam os dados; os testes montam os casos de uso na mão, com repositórios falsos. Os módulos `membership` (login e lista de autorizados), `inbox` (Caixas) e `message` (recebimento e leitura de Mensagens) mostram as quatro camadas; `health` só tem as três primeiras, e `mcp` só a `ui` (as ferramentas do MCP, que são a apresentação para agentes e chamam os casos de uso de `inbox` e `message`). As regras de negócio dos casos de uso devolvem `Result` (sem lançar), e as rotas traduzem cada erro em um status HTTP.

## Login e lista de autorizados

Login com GitHub pelo [Better Auth](https://www.better-auth.com), sem senha e sem email. Só entra quem tem o username do GitHub em `ALLOWED_GITHUB_USERS` (separado por vírgula, sem diferenciar maiúsculas).

**Configurar (uma vez):**
1. No GitHub, em Settings → Developer settings → OAuth Apps, crie um app com o callback `https://tempmail.mateussiil.com.br/api/auth/callback/github`.
2. No Coolify, preencha `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` e `BETTER_AUTH_SECRET` (gere com `openssl rand -base64 32`). `BETTER_AUTH_URL` e `ALLOWED_GITHUB_USERS` também são variáveis do app.
3. Faça um novo deploy: variáveis só valem no próximo deploy. Enquanto faltar alguma, as páginas mostram "Login ainda não configurado" com os nomes que faltam, em vez de erro.

**Como a lista funciona:**
- É conferida **em todo pedido**, não só no login. Tirar um username da variável e fazer deploy corta o acesso na hora, mesmo com a sessão ainda válida (a pessoa cai em "Seu acesso foi encerrado"). A sessão dura 30 dias e é conferida no banco a cada pedido, sem cache de cookie.
- **Lista vazia não autoriza ninguém.**
- O username do GitHub é gravado quando o Membro é criado e **nunca mais é atualizado**, e há um índice único (sem diferenciar maiúsculas). Assim, quem herdar um username que alguém abandonou no GitHub não consegue criar um Membro com ele. Em troca, se alguém do time **renomear a conta no GitHub**, o username antigo continua valendo para essa pessoa, e o novo não entra na lista sozinho: peça a um admin pra ajustar a conta no banco.
- A rota de edição de perfil do Better Auth (`/update-user`) está desligada, e um hook recusa qualquer mudança em `githubUsername`: ninguém troca o próprio username por um que esteja na lista.

**Schema de autenticação:** gerado pelo CLI do Better Auth (veja `auth.cli.ts`), e as migrations do Drizzle vêm dele. O índice único de `github_username` é manual em `src/shared/db/auth-schema.ts`: ao regenerar o arquivo, recoloque-o.

## Caixas

Uma **Caixa** é um endereço `<nome>@tmp.mateussiil.com.br` criado explicitamente por um Membro (os termos estão em [`CONTEXT.md`](./CONTEXT.md)). Módulo `inbox`.

**Regras**
- **Criação explícita.** Nome escolhido (3 a 40 caracteres: letras, números, ponto e hífen, sem separador no começo, no fim ou repetido; guardado em minúsculas) ou aleatório (8 caracteres, como `k7f3qx9m`).
- **O endereço é do primeiro Dono pra sempre**, mesmo depois de expirar. Criar um endereço seu que expirou **reativa** a mesma Caixa, vazia. Endereço de outro Membro é recusado.
- **Prazo** de 24 h (`INBOX_TTL_HOURS`). **Manter** tira o prazo; **Apagar** expira agora (inclusive uma mantida); **Reativar** devolve a Caixa com novo prazo, ou já mantida.
- **Limite** de 20 Caixas ativas por Membro, contando as mantidas (`MAX_ACTIVE_INBOXES_PER_MEMBER`). Apagar ou expirar libera vaga.
- A Caixa de outro Membro e uma inexistente respondem igual (`404`).
- O estado "expirada" é calculado pelo prazo na hora da leitura. Apagar as Mensagens e os arquivos do R2 de uma Caixa expirada é trabalho do ticket de expiração.

**API** (autenticada pela sessão do navegador; as chaves de API entram no ticket das chaves):

| Rota | O que faz |
|---|---|
| `GET /api/inboxes` | Lista as suas Caixas: ativas primeiro, as mais novas antes. |
| `POST /api/inboxes` | Cria. Corpo opcional `{"address": "meu-nome"}`; sem ele, endereço aleatório. Responde `201`, ou `200` com `reactivated: true` se reativou. |
| `PATCH /api/inboxes/{id}` | `{"kept": true}` mantém, `{"kept": false}` deixa de manter. |
| `DELETE /api/inboxes/{id}` | Apaga (expira agora). Repetir não faz mal. |
| `POST /api/inboxes/{id}/reactivate` | Reativa uma Caixa expirada. Corpo opcional `{"keep": true}`. |
| `GET /api/inboxes/availability?address=…` | Diz o que aconteceria ao criar: `free`, `yours_expired`, `yours_active`, `taken` ou `invalid` (com `problem`). |

Erros vêm como `{"error": "<código>", "message": "<texto em português>"}`: `400` (`invalid_address`, `invalid_body`), `401` (sem sessão), `403` (`access_ended`), `404` (`not_found`), `409` (`address_taken`, `already_active`, `limit_reached` com `max`, `not_active`, `not_expired`), `415` e `503` (login não configurado). Com corpo, o `Content-Type` precisa ser `application/json`.

**Testes de integração.** `TEST_DATABASE_URL=postgres://... npm test` roda também os testes contra um Postgres de verdade. Cada arquivo de teste **cria o próprio banco descartável** (e o apaga no fim), então rodam em paralelo e o banco da URL não é alterado. O usuário precisa poder criar bancos. Sem a variável, esses testes são pulados. O CI sobe um Postgres e define a variável.

## Chaves de API

Para usar a API fora do navegador (scripts, agentes e o [MCP](#servidor-mcp)), cada Membro cria **Chaves de API** com nome. O segredo (`tm_…`) aparece **uma vez só**, na criação; o banco guarda só o hash e o prefixo. A chave não expira nem tem escopo: vale até ser revogada, e tem os mesmos poderes do Membro.

| Rota | O que faz |
| --- | --- |
| `POST /api/keys` | Cria. Corpo `{"name": "meu-script"}` (1 a 60 caracteres). A resposta traz `token`. |
| `GET /api/keys` | Lista as suas chaves (prefixo, último uso, revogada), sem o segredo. |
| `DELETE /api/keys/{id}` | Revoga; deixa de valer no pedido seguinte. Repetir não faz mal. |

Essas três rotas só aceitam a **sessão do navegador** (uma chave vazada não gera outras). Todas as outras rotas aceitam a chave, em `Authorization: Bearer tm_…` ou `X-API-Key: tm_…`:

```bash
curl -H "Authorization: Bearer $TEMPMAIL_KEY" https://tempmail.mateussiil.com.br/api/inboxes
```

- A lista `ALLOWED_GITHUB_USERS` é conferida a **cada pedido**: tirar um username dela corta as chaves dele na hora.
- Se vier uma chave, só ela vale: chave inválida ou revogada dá `401` (`invalid_api_key`), sem cair para a sessão.
- **Limite:** 60 pedidos por minuto por chave (`API_RATE_LIMIT_PER_MINUTE`). Passou, `429` com `Retry-After` em segundos. A contagem fica na memória do processo, o que vale com uma instância só (o caso do Coolify).

## Recebimento de emails

O caminho de um email: o MX de `tmp.mateussiil.com.br` entrega ao **Resend** → o Resend chama `POST /api/webhooks/resend` (assinado) → o app busca o email na API do Resend e baixa o `.eml` na hora (o link expira em cerca de 1 h) → grava o `.eml` no **R2** (`caixas/<id-da-caixa>/<id-da-mensagem>.eml`) e os campos prontos no Postgres (tabela `message`) → avisa com `NOTIFY inbox_message` (o `wait_for_email` do MCP escuta esse canal). Módulo `message`.

**Configurar (uma vez):**
1. **`RESEND_API_KEY`:** uma chave do Resend com **acesso total**. Chave só de envio é recusada pela API de emails recebidos (`restricted_api_key`). A conta é compartilhada com os outros domínios, então crie uma chave só pro tempmail (nome `tempmail`) para poder revogá-la sem afetar o resto, e deixe-a só no Coolify.
2. **`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET`:** as credenciais do bucket `tempmail`.
3. Faça o deploy. **Depois** crie o webhook no painel do Resend (Webhooks → Add Webhook): URL `https://tempmail.mateussiil.com.br/api/webhooks/resend`, evento `email.received`. Copie o **Signing Secret** dele para `RESEND_WEBHOOK_SECRET` e faça novo deploy. Enquanto faltar alguma variável, a rota responde `503 receiving_not_configured`, listando só os nomes que faltam (o Resend reenvia depois).

**Como funciona:**
- **A assinatura** (Svix: `svix-id`, `svix-timestamp`, `svix-signature`) é conferida sobre o **corpo bruto**, com tolerância de 5 minutos, antes de qualquer outra coisa. Assinatura inválida, ausente ou velha recebe `400`.
- **Destinatários:** usa `received_for` (o destinatário do envelope SMTP) e, se vier vazio, `to`, `cc` e `bcc`, só os do `MAIL_DOMAIN`. A documentação do Resend não explica o que cada campo traz num catch-all, então confira com os payloads reais (veja a depuração abaixo). Sem Caixa ativa, o email é um **Email órfão**: descartado com `200`, só com um registro no log, sem tocar na cota nem no R2.
- **Idempotente:** o id da Mensagem vem do email e da Caixa, então reenviar o aviso não duplica (`outcome: duplicate`) e uma nova tentativa sobrescreve o mesmo arquivo no R2. O Resend reenvia por cerca de 40 h.
- **Falhas passageiras** (Resend com 429 ou 5xx, link do `.eml`, R2, banco) e **de configuração** (chave sem permissão, credencial do R2 recusada) respondem `503` sem gravar nada, pro Resend reenviar. O motivo fica no log (`webhook.failed`).
- **Cota do Resend estourada** (`email_above_quota`): o conteúdo se perdeu no Resend, então a Mensagem é gravada só com o que o aviso trouxe (remetente, assunto, anexos) e `status: quota_exceeded`. **Acima de `MAX_MESSAGE_MB`** (10) fica `too_large`, só com os metadados.
- **O código de verificação** (4 a 8 dígitos perto de "código", "code", "verification"…) é extraído do assunto ou do corpo por heurística; sem palavra de contexto, não adivinha.
- **O corpo `html` é de terceiros.** Quem exibir precisa isolá-lo (iframe com `sandbox`).

**API de leitura** (sessão do navegador, como a das Caixas):

| Rota | O que faz |
|---|---|
| `GET /api/inboxes/{id}/messages?limit=` | As Mensagens da Caixa, as mais recentes primeiro, sem o corpo (`limit` de 1 a 100, 50 por padrão). Uma Caixa expirada não tem Mensagens. |
| `GET /api/messages/{id}` | A Mensagem completa: `text`, `html`, `verificationCode`, `attachments` (metadados) e `hasRaw`. |

A Mensagem de outra pessoa, uma inexistente e uma de Caixa expirada respondem igual (`404`).

**Depuração.** Com `WEBHOOK_DEBUG_LOG=true`, o app registra o payload do webhook e a resposta crua do Resend (eventos `debug.*`). Serve para capturar exemplos reais; **use só com emails de teste e desligue depois**, porque o conteúdo dos emails vai para o log. Os segredos nunca são registrados.

## Servidor MCP

Servidor MCP remoto em `https://tempmail.mateussiil.com.br/api/mcp` ([`mcp-handler`](https://github.com/vercel/mcp-handler) 2, Streamable HTTP sem sessão; atende clientes da spec 2026-07-28 e os de 2025). Serve para um agente criar uma Caixa, usar o endereço num cadastro e pegar o código de verificação sozinho.

**Conectar** (crie uma Chave de API antes, pela página ou por `POST /api/keys`):

```bash
claude mcp add --transport http tempmail https://tempmail.mateussiil.com.br/api/mcp --header "Authorization: Bearer tm_..."
```

No Cursor, em `~/.cursor/mcp.json` (ou `.cursor/mcp.json` no projeto), com a chave numa variável de ambiente:

```json
{
  "mcpServers": {
    "tempmail": {
      "url": "https://tempmail.mateussiil.com.br/api/mcp",
      "headers": { "Authorization": "Bearer ${env:TEMPMAIL_KEY}" }
    }
  }
}
```

**Autenticação.** Só com Chave de API (`Authorization: Bearer tm_…` ou `X-API-Key: tm_…`); a sessão do navegador não vale aqui. É a mesma autenticação da API: lista de autorizados conferida a cada pedido (`403 access_ended`), chave inválida ou revogada dá `401`, e o limite de 60 pedidos por minuto por chave dá `429` com `Retry-After`. **Cada pedido HTTP conta uma vez**, então um `wait_for_email` de 2 minutos é um pedido só. Sem chave, `401` com `WWW-Authenticate: Bearer`. O login por OAuth (conector do claude.ai) é outro ticket.

**Ferramentas.** Todas enxergam só as Caixas e Mensagens do dono da chave; a de outro Membro responde `not_found`, igual a uma que não existe.

| Ferramenta | O que faz |
|---|---|
| `create_inbox` | Cria uma Caixa (`address` opcional; sem ele, aleatório). Devolve `id` e `fullAddress`. Criar um endereço seu expirado reativa a Caixa. |
| `list_inboxes` | Lista as suas Caixas ativas (`include_expired: true` para todas). |
| `keep_inbox` | Mantém (`kept: true`, o padrão) ou deixa de manter uma Caixa ativa. |
| `delete_inbox` | Apaga (expira agora). Marcada como destrutiva. |
| `list_messages` | As Mensagens de uma Caixa, sem o corpo, com `verificationCode`. |
| `get_message` | Uma Mensagem: `content` em texto (ou `format: "html"`), cortado em `max_chars` (20 000; até 100 000) com `truncated`, links e anexos (metadados). |
| `extract_code` | O código de verificação e os links de confirmação de uma Mensagem. |
| `wait_for_email` | Espera a próxima Mensagem e já devolve código e links (abaixo). |

Erros de negócio voltam como resultado de erro da ferramenta (`isError`), com `{"error": "<código>", "message": "…"}` e os mesmos códigos da API. O conteúdo das Mensagens é de terceiros: as respostas de `get_message`, `extract_code` e `wait_for_email` trazem um `notice` dizendo para tratar texto, links e anexos como dados, nunca como instruções.

**`wait_for_email`** (`inbox_id`, `timeout_seconds` de 1 a 120 com padrão 45, `since`, `from_contains`, `subject_contains`):
- **Sem `since`**, vale a Mensagem mais recente que já esteja na Caixa e passe nos filtros; se não houver, espera a primeira. **Com `since`** (o `cursor` de uma resposta anterior), espera a primeira gravada depois dele. Assim, um email que chegou antes da chamada não se perde, e o agente avança Mensagem a Mensagem sem repetir.
- Respostas: `received` (com `message`, que traz `verificationCode`, `links` e `preview`, e `cursor`); `content_unavailable` com `reason: quota_exceeded` ou `too_large`, na hora, porque esperar não traria o código; e `timeout` com `cursor`, que **não é erro**: o agente chama de novo. Caixa expirada dá `inbox_expired`, sem esperar.
- **Como espera:** confere o banco, assina o `LISTEN inbox_message` e confere de novo (fecha a janela entre as duas coisas), e então dorme até o `NOTIFY` da Caixa, o prazo ou o cancelamento do pedido. Todas as esperas do processo dividem **uma conexão `LISTEN`** só (fora do pool); se ela cair, reconecta e acorda quem espera. A cada 10 s manda `notifications/progress` (se o cliente pediu, com `progressToken`), o que mantém o cliente longe do tempo ocioso, e confere o banco mesmo sem aviso.
- O `cursor` é a hora em que o app gravou a Mensagem (`createdAt`), não a do email; por isso o recebimento marca essa hora logo antes de gravar.

**Proxy (Coolify/Traefik).** A resposta de uma chamada é um stream SSE com `Cache-Control: no-cache, no-transform` e `X-Accel-Buffering: no`: a compressão do Next não se aplica (respeita o `no-transform`) e o SDK manda um comentário de keep-alive a cada 15 s. Como o prazo máximo é 120 s, fica abaixo do tempo ocioso padrão do Traefik (180 s). Para testar à mão:

```bash
curl -N https://tempmail.mateussiil.com.br/api/mcp \
  -H "Authorization: Bearer $TEMPMAIL_KEY" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wait_for_email","arguments":{"inbox_id":"<id>","timeout_seconds":60},"_meta":{"progressToken":"t"}}}'
```

O progresso deve aparecer aos 10 s, 20 s…, e não tudo junto no fim. Se aparecer junto, algo no caminho está segurando o stream.

## Deploy (Coolify)

- Build pack: **Dockerfile**, porta **3000**, domínio `tempmail.mateussiil.com.br`.
- Healthcheck: `GET /api/health` (200 com o banco no ar, 503 sem). No Coolify, configure o **host do healthcheck como `127.0.0.1`**, não `localhost`: na imagem Alpine o `localhost` resolve primeiro para IPv6 e o Next escuta só em IPv4, então a checagem falha com "Connection refused" e o deploy é revertido. A imagem também não tem `curl`, só o `wget` do BusyBox.
- Recursos no Coolify: projeto `tempmail` (ambiente `production`) com o app `tempmail` e o Postgres `tempmail-db`, no servidor `localhost` (o mesmo pra onde aponta o curinga `*.mateussiil.com.br`). A `DATABASE_URL` do app aponta pro host interno do banco.
- Variáveis de ambiente: ver [`.env.example`](./.env.example). Segredos só no Coolify, nunca no repositório.
- Não servir o app em `tmp.mateussiil.com.br`: esse nome é só do email (MX).
