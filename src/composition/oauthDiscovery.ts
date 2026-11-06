import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/modules/membership/infrastructure/auth";
import { missingAuthEnv } from "@/shared/config/env";

/**
 * Os documentos de descoberta do OAuth ficam na raiz do domínio
 * (`/.well-known/...`), fora de `/api/auth`, onde o Better Auth atende. Estas
 * funções servem as rotas do Next que os expõem. Sem o login configurado, não
 * há servidor de autorização: 404.
 */
function configured(): boolean {
  return missingAuthEnv().length === 0;
}

const notFound = () => new Response(null, { status: 404 });

/** RFC 9728: o recurso protegido (/api/mcp) e qual servidor de autorização emite os tokens. */
export async function protectedResourceMetadata(request: Request): Promise<Response> {
  if (!configured()) return notFound();
  // O plugin do MCP responde a este caminho antes de qualquer rota do Better Auth.
  return getAuth().handler(request);
}

/** RFC 8414: os endpoints do servidor de autorização (authorize, token, jwks…). */
export async function authorizationServerMetadata(request: Request): Promise<Response> {
  if (!configured()) return notFound();
  return oauthProviderAuthServerMetadata(getAuth())(request);
}

/** OpenID Connect Discovery, para clientes que procuram por ele. */
export async function openIdConfiguration(request: Request): Promise<Response> {
  if (!configured()) return notFound();
  return oauthProviderOpenIdConfigMetadata(getAuth())(request);
}
