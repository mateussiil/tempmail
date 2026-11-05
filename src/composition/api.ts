import type { Member } from "@/modules/membership/domain/Member";
import { missingAuthEnv } from "@/shared/config/env";
import { composeGetCurrentMember } from "./membership";
import { jsonNoStore } from "./http";

/**
 * Quem está chamando a API, pela sessão. Devolve o Membro, ou a resposta de
 * erro pronta (401, 403 ou 503). A autenticação por chave de API entra aqui
 * quando o ticket das chaves chegar, e todas as rotas já passam por esta função.
 */
export async function authenticateMember(): Promise<{ member: Member } | { response: Response }> {
  if (missingAuthEnv().length > 0) {
    return {
      response: jsonNoStore(
        { error: "auth_not_configured", message: "O login ainda não foi configurado." },
        503,
      ),
    };
  }

  const current = await composeGetCurrentMember().execute();

  if (current.status === "anonymous") {
    return {
      response: jsonNoStore({ error: "unauthenticated", message: "Faça login para continuar." }, 401),
    };
  }
  if (current.status === "revoked") {
    return {
      response: jsonNoStore({ error: "access_ended", message: "Seu acesso foi encerrado." }, 403),
    };
  }
  return { member: current.member };
}
