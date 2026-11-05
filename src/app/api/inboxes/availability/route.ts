import { authenticateMember } from "@/composition/api";
import { badRequest, jsonNoStore } from "@/composition/http";
import { composeInboxUseCases } from "@/composition/inbox";

/**
 * `GET /api/inboxes/availability?address=meu-nome`: diz o que aconteceria ao
 * criar o endereço (`free`, `yours_expired`, `yours_active`, `taken` ou
 * `invalid`). Serve ao campo de nome da tela de nova Caixa.
 */
export async function GET(request: Request) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const address = new URL(request.url).searchParams.get("address");
  if (address === null) return badRequest('Informe o parâmetro "address".');

  const result = await composeInboxUseCases().check.execute({
    ownerId: auth.member.id,
    address,
  });
  return jsonNoStore(result);
}
