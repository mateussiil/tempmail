// Imports relativos de propósito: o CLI do Better Auth lê este arquivo para
// gerar o schema e não resolve o alias "@/".
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../../../shared/db/client";
import * as schema from "../../../shared/db/schema";
import { Allowlist } from "../domain/Allowlist";

const ONE_DAY = 60 * 60 * 24;

/** O escopo que dá acesso às ferramentas do MCP (as mesmas da Chave de API). */
export const MCP_SCOPE = "tempmail";

/** O endereço público do app, sem barra no fim. */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.BETTER_AUTH_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** O recurso protegido (RFC 8707/9728): a URL do MCP, que os tokens OAuth trazem como `aud`. */
export function mcpResourceUrl(env: Record<string, string | undefined> = process.env): string {
  return `${appUrl(env)}/api/mcp`;
}

/**
 * Onde o MCP busca as chaves públicas para validar os tokens OAuth. Por
 * padrão, o próprio servidor por dentro (`127.0.0.1`), sem sair pela internet
 * e voltar pelo proxy. `OAUTH_JWKS_URL` troca, se o app não escutar ali.
 */
export function jwksUrl(env: Record<string, string | undefined> = process.env): string {
  return env.OAUTH_JWKS_URL?.trim() || `http://127.0.0.1:${env.PORT?.trim() || "3000"}/api/auth/jwks`;
}

/**
 * Hosts de onde aceitamos um Client ID Metadata Document (`OAUTH_CLIENT_HOSTS`,
 * separados por vírgula). Por padrão só o claude.ai: ninguém mais consegue se
 * apresentar como cliente OAuth do tempmail.
 */
export function oauthClientHosts(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.OAUTH_CLIENT_HOSTS?.trim() || "claude.ai";
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/** O `client_id` (uma URL https) é de um host permitido? */
export function isAllowedClientIdUrl(clientIdUrl: string, hosts: string[]): boolean {
  try {
    const url = new URL(clientIdUrl);
    return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Código do erro quando o usuário do GitHub não está na lista. Com `code`, o
 * Better Auth redireciona o callback para a página de erro (`/entrar?error=…`)
 * em vez de mostrar o JSON cru.
 */
export const NOT_ON_ALLOWLIST_CODE = "NOT_ON_ALLOWLIST";

/** Recusa a criação do Membro se o username do GitHub não está na lista. */
export function assertAllowedToJoin(githubUsername: unknown, allowlist: Allowlist): void {
  if (typeof githubUsername !== "string" || !allowlist.allows(githubUsername)) {
    throw new APIError("FORBIDDEN", {
      message: "Este usuário do GitHub não está na lista do time.",
      code: NOT_ON_ALLOWLIST_CODE,
    });
  }
}

/** Os passos do OAuth em que um usuário dá acesso a um cliente. */
const OAUTH_GRANT_PATHS = new Set(["/oauth2/authorize", "/oauth2/consent", "/oauth2/continue"]);

/**
 * A lista de autorizados vale também para o conector do claude.ai: quem saiu
 * dela não autoriza nada (o MCP ainda confere de novo a cada pedido).
 */
const allowlistOnOAuth = createAuthMiddleware(async (ctx) => {
  if (!OAUTH_GRANT_PATHS.has(ctx.path)) return;
  const session = await getSessionFromCtx(ctx);
  if (!session) return; // sem sessão, o authorize manda para o login
  const username = (session.user as Record<string, unknown>).githubUsername;
  if (typeof username !== "string" || !Allowlist.fromString(process.env.ALLOWED_GITHUB_USERS).allows(username)) {
    throw new APIError("FORBIDDEN", { message: "Seu acesso foi encerrado.", error: "access_denied" });
  }
});

export function createAuth() {
  const db = drizzle(getPool(), { schema });

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: process.env.BETTER_AUTH_URL || undefined,
    secret: process.env.BETTER_AUTH_SECRET || undefined,
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
        // O login do GitHub é gravado só na criação do Membro e nunca mais é
        // atualizado (não usamos overrideUserInfoOnSignIn): o username fica
        // fixado, e quem herdar um username antigo não herda o acesso.
        mapProfileToUser: (profile) => ({ githubUsername: profile.login.toLowerCase() }),
      },
    },
    user: {
      additionalFields: {
        githubUsername: { type: "string", required: true, input: true },
      },
    },
    // 30 dias, e cada getSession confere no banco: sem cache de cookie, uma
    // sessão revogada deixa de valer no pedido seguinte.
    session: {
      expiresIn: 30 * ONE_DAY,
      updateAge: ONE_DAY,
      cookieCache: { enabled: false },
    },
    // Sem edição de perfil: ninguém troca o próprio githubUsername. E sem a
    // rota /token do plugin JWT: um JWT de sessão nunca vale como token OAuth.
    disabledPaths: ["/update-user", "/token"],
    onAPIError: { errorURL: "/entrar" },
    hooks: { before: allowlistOnOAuth },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const username = (user as Record<string, unknown>).githubUsername;
            assertAllowedToJoin(username, Allowlist.fromString(process.env.ALLOWED_GITHUB_USERS));
            return { data: user };
          },
        },
        update: {
          before: async (data) => {
            if ("githubUsername" in data) {
              throw new APIError("FORBIDDEN", {
                message: "O username do GitHub não pode ser alterado.",
              });
            }
            return { data };
          },
        },
      },
    },
    plugins: [
      // Chaves de assinatura e /jwks para os tokens OAuth (sem o cabeçalho de JWT na sessão).
      jwt({ disableSettingJwtHeader: true }),
      // O app vira o servidor OAuth que o claude.ai espera (descoberta, PKCE,
      // tokens presos ao recurso /api/mcp). O login passa pelo GitHub e pela lista.
      mcp({
        loginPage: "/entrar",
        consentPage: "/consentir",
        resource: mcpResourceUrl(),
        scopes: ["openid", "profile", "offline_access", MCP_SCOPE],
        clientRegistrationDefaultScopes: ["openid", "profile", "offline_access", MCP_SCOPE],
        // Um refresh repetido por engano pode reaproveitar a resposta por 30 s (padrão do MCP).
        refreshTokenReuseInterval: 30,
      }),
      // O claude.ai se identifica por um documento de metadados (CIMD), sem
      // registro dinâmico de clientes, que fica desligado.
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
        isMetadataDocumentUrlAllowed: (clientIdUrl) => isAllowedClientIdUrl(clientIdUrl, oauthClientHosts()),
      }),
      nextCookies(), // precisa ser o último plugin
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Criado sob demanda: build e testes não precisam de banco nem de segredos. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
