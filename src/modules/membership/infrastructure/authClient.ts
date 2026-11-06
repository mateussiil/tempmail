import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

/**
 * Só para componentes de cliente (entrar, sair, consentir). O plugin do OAuth
 * leva o pedido de autorização assinado (da query da página) junto do login
 * e do consentimento, para o fluxo do conector do claude.ai continuar.
 */
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });
