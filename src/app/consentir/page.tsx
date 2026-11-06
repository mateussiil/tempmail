import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { headers } from "next/headers";
import { connection } from "next/server";
import { ConsentButtons } from "@/app/_components/ConsentButtons";
import { requireMember } from "@/composition/membership";
import { getAuth } from "@/modules/membership/infrastructure/auth";
import { ConsentErrorPage, ConsentPage, describeScopes } from "@/modules/membership/ui/ConsentPage";
import { NotConfiguredPage } from "@/modules/membership/ui/NotConfiguredPage";
import { missingAuthEnv } from "@/shared/config/env";

export const metadata = { title: "Permitir acesso · tempmail" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toQuery(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  return query.toString();
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Tela de consentimento do OAuth (o conector do claude.ai). Só um Membro da
 * lista chega aqui: quem saiu vai para "Seu acesso foi encerrado". O pedido
 * vem assinado pelo servidor; adulterado ou vencido, a tela recusa.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  const missing = missingAuthEnv();
  if (missing.length > 0) return <NotConfiguredPage missing={missing} />;

  const member = await requireMember();
  const params = await searchParams;
  const query = toQuery(params);

  const auth = getAuth();
  const { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(query, secret))) {
    return <ConsentErrorPage message="O pedido de autorização é inválido ou venceu." />;
  }

  const signed = new URLSearchParams(query);
  const clientId = signed.get("client_id") ?? "";
  let clientName: string;
  try {
    const client = await auth.api.getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() });
    clientName = client.client_name?.trim() || clientId;
  } catch {
    return <ConsentErrorPage message="O aplicativo que pediu a conexão não é conhecido." />;
  }

  let redirectHost = "";
  try {
    redirectHost = new URL(signed.get("redirect_uri") ?? "").hostname;
  } catch {
    // Sem redirect_uri legível, mostra o client_id.
  }

  return (
    <ConsentPage
      clientName={clientName}
      redirectHost={redirectHost || clientId}
      loopbackOnly={LOOPBACK.has(redirectHost)}
      scopes={describeScopes(signed.get("scope") ?? "")}
      githubUsername={member.githubUsername}
      actions={<ConsentButtons />}
    />
  );
}
