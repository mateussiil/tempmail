// Imports relativos de propósito: o CLI do Better Auth lê este arquivo para
// gerar o schema e não resolve o alias "@/".
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "../../../shared/db/client";
import * as schema from "../../../shared/db/schema";
import { Allowlist } from "../domain/Allowlist";

const ONE_DAY = 60 * 60 * 24;

/** Recusa a criação do Membro se o username do GitHub não está na lista. */
export function assertAllowedToJoin(githubUsername: unknown, allowlist: Allowlist): void {
  if (typeof githubUsername !== "string" || !allowlist.allows(githubUsername)) {
    throw new APIError("FORBIDDEN", {
      message: "Este usuário do GitHub não está na lista do time.",
    });
  }
}

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
    // Sem edição de perfil: ninguém troca o próprio githubUsername.
    disabledPaths: ["/update-user"],
    onAPIError: { errorURL: "/entrar" },
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
    plugins: [nextCookies()], // precisa ser o último plugin
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Criado sob demanda: build e testes não precisam de banco nem de segredos. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
