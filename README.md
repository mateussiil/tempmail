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

Regras: componentes recebem só o que precisam (nunca repositório nem configuração); os pontos de entrada chamam os casos de uso e preparam os dados; os testes montam os casos de uso na mão, com repositórios falsos. Os módulos `membership` (login e lista de autorizados), `inbox` (Caixas) e `message` (recebimento e leitura de Mensagens) mostram as quatro camadas; `health` só tem as três primeiras. As regras de negócio dos casos de uso devolvem `Result` (sem lançar), e as rotas traduzem cada erro em um status HTTP.

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

## Deploy (Coolify)

- Build pack: **Dockerfile**, porta **3000**, domínio `tempmail.mateussiil.com.br`.
- Healthcheck: `GET /api/health` (200 com o banco no ar, 503 sem). No Coolify, configure o **host do healthcheck como `127.0.0.1`**, não `localhost`: na imagem Alpine o `localhost` resolve primeiro para IPv6 e o Next escuta só em IPv4, então a checagem falha com "Connection refused" e o deploy é revertido. A imagem também não tem `curl`, só o `wget` do BusyBox.
- Recursos no Coolify: projeto `tempmail` (ambiente `production`) com o app `tempmail` e o Postgres `tempmail-db`, no servidor `localhost` (o mesmo pra onde aponta o curinga `*.mateussiil.com.br`). A `DATABASE_URL` do app aponta pro host interno do banco.
- Variáveis de ambiente: ver [`.env.example`](./.env.example). Segredos só no Coolify, nunca no repositório.
- Não servir o app em `tmp.mateussiil.com.br`: esse nome é só do email (MX).
