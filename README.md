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

Regras: componentes recebem só o que precisam (nunca repositório nem configuração); os pontos de entrada chamam os casos de uso e preparam os dados; os testes montam os casos de uso na mão, com repositórios falsos. O módulo `membership` (login e lista de autorizados) mostra as quatro camadas; `health` só tem as três primeiras.

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

## Deploy (Coolify)

- Build pack: **Dockerfile**, porta **3000**, domínio `tempmail.mateussiil.com.br`.
- Healthcheck: `GET /api/health` (200 com o banco no ar, 503 sem). No Coolify, configure o **host do healthcheck como `127.0.0.1`**, não `localhost`: na imagem Alpine o `localhost` resolve primeiro para IPv6 e o Next escuta só em IPv4, então a checagem falha com "Connection refused" e o deploy é revertido. A imagem também não tem `curl`, só o `wget` do BusyBox.
- Recursos no Coolify: projeto `tempmail` (ambiente `production`) com o app `tempmail` e o Postgres `tempmail-db`, no servidor `localhost` (o mesmo pra onde aponta o curinga `*.mateussiil.com.br`). A `DATABASE_URL` do app aponta pro host interno do banco.
- Variáveis de ambiente: ver [`.env.example`](./.env.example). Segredos só no Coolify, nunca no repositório.
- Não servir o app em `tmp.mateussiil.com.br`: esse nome é só do email (MX).
