import { HttpInboxGateway } from "@/modules/inbox/infrastructure/HttpInboxGateway";
import { HttpApiKeyGateway } from "@/modules/membership/infrastructure/HttpApiKeyGateway";
import { HttpMessageGateway } from "@/modules/message/infrastructure/HttpMessageGateway";
import type { FetchFn } from "@/shared/http/apiClient";

/**
 * Composição do lado do navegador: os gateways HTTP que as telas usam, sobre a
 * sessão do navegador. Os testes montam as telas com gateways falsos.
 */
export function composeBrowserGateways(fetchFn: FetchFn = (input, init) => fetch(input, init)) {
  return {
    inboxes: new HttpInboxGateway(fetchFn),
    messages: new HttpMessageGateway(fetchFn),
    apiKeys: new HttpApiKeyGateway(fetchFn),
  };
}

/** Sessão acabada ou acesso encerrado no meio do uso: recarrega na tela certa. */
export function leaveEndedSession(reason: "anonymous" | "revoked"): void {
  window.location.assign(reason === "revoked" ? "/acesso-encerrado" : "/entrar");
}
