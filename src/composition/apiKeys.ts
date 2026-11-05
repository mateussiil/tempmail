import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import {
  CreateApiKeyUseCase,
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
} from "@/modules/membership/application/ApiKeyUseCases";
import { AuthenticateApiKeyUseCase } from "@/modules/membership/application/AuthenticateApiKeyUseCase";
import { Allowlist } from "@/modules/membership/domain/Allowlist";
import { DrizzleApiKeyRepository } from "@/modules/membership/infrastructure/DrizzleApiKeyRepository";
import { FixedWindowRateLimiter } from "@/modules/membership/infrastructure/FixedWindowRateLimiter";
import { apiRateLimitPerMinute } from "@/shared/config/env";
import { getDb } from "@/shared/db/client";

// Um limitador só por processo: a contagem precisa sobreviver entre pedidos.
const globalForLimiter = globalThis as unknown as { __tempmailLimiter?: FixedWindowRateLimiter };

function limiter(): FixedWindowRateLimiter {
  globalForLimiter.__tempmailLimiter ??= new FixedWindowRateLimiter(apiRateLimitPerMinute());
  return globalForLimiter.__tempmailLimiter;
}

export function composeApiKeyUseCases() {
  const repository = new DrizzleApiKeyRepository(getDb());
  const clock = () => new Date();

  return {
    create: new CreateApiKeyUseCase({ repository, clock, newId: () => randomUUID() }),
    list: new ListApiKeysUseCase({ repository }),
    revoke: new RevokeApiKeyUseCase({ repository, clock }),
  };
}

export function composeAuthenticateApiKey(): AuthenticateApiKeyUseCase {
  return new AuthenticateApiKeyUseCase({
    repository: new DrizzleApiKeyRepository(getDb()),
    // Lida de novo a cada pedido: tirar um username da lista corta as chaves dele.
    allowlist: () => Allowlist.fromString(process.env.ALLOWED_GITHUB_USERS),
    limiter: limiter(),
    clock: () => new Date(),
  });
}

/** O segredo enviado em `Authorization: Bearer` ou `X-API-Key`; `null` se não veio nenhum dos dois. */
export async function readApiKeyToken(): Promise<string | null> {
  const requestHeaders = await headers();

  const bearer = /^Bearer\s+(.+)$/i.exec(requestHeaders.get("authorization") ?? "");
  if (bearer) return bearer[1].trim();

  const direct = requestHeaders.get("x-api-key")?.trim();
  return direct ? direct : null;
}
