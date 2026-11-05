import type { Member } from "@/modules/membership/domain/Member";
import { missingAuthEnv } from "@/shared/config/env";
import { composeAuthenticateApiKey, readApiKeyToken } from "./apiKeys";
import { composeGetCurrentMember } from "./membership";
import { jsonNoStore } from "./http";

type Authenticated = { member: Member } | { response: Response };

const authNotConfigured = () =>
  jsonNoStore({ error: "auth_not_configured", message: "O login ainda não foi configurado." }, 503);

const accessEnded = () =>
  jsonNoStore({ error: "access_ended", message: "Seu acesso foi encerrado." }, 403);

/**
 * Quem está chamando a API: a Chave de API (`Authorization: Bearer` ou
 * `X-API-Key`) ou, sem ela, a sessão do navegador. Se veio uma chave, só ela
 * vale: uma chave ruim nunca cai para a sessão. Devolve o Membro, ou a resposta
 * de erro pronta (401, 403, 429 ou 503).
 */
export async function authenticateMember(): Promise<Authenticated> {
  if (missingAuthEnv().length > 0) return { response: authNotConfigured() };

  const token = await readApiKeyToken();
  if (token === null) return authenticateSession();

  const result = await composeAuthenticateApiKey().execute(token);
  switch (result.status) {
    case "member":
      return { member: result.member };
    case "revoked":
      return { response: accessEnded() };
    case "rate_limited":
      return {
        response: Response.json(
          { error: "rate_limited", message: "Muitos pedidos. Tente de novo em instantes." },
          {
            status: 429,
            headers: { "Cache-Control": "no-store", "Retry-After": String(result.retryAfterSeconds) },
          },
        ),
      };
    case "invalid":
      return {
        response: jsonNoStore({ error: "invalid_api_key", message: "Chave de API inválida ou revogada." }, 401),
      };
  }
}

/**
 * Só a sessão do navegador. Criar, listar e revogar chaves usa esta: uma chave
 * vazada não pode gerar outras chaves.
 */
export async function authenticateSession(): Promise<Authenticated> {
  if (missingAuthEnv().length > 0) return { response: authNotConfigured() };

  const current = await composeGetCurrentMember().execute();

  if (current.status === "anonymous") {
    return {
      response: jsonNoStore({ error: "unauthenticated", message: "Faça login para continuar." }, 401),
    };
  }
  if (current.status === "revoked") return { response: accessEnded() };
  return { member: current.member };
}
