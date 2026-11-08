import { authenticateMember } from "@/composition/api";
import { badRequest, inboxErrorResponse, jsonNoStore, readJsonObject } from "@/composition/http";
import { composeInboxUseCases } from "@/composition/inbox";
import { isMascotId } from "@/modules/inbox/domain/Mascot";

/** Lista as Caixas do Membro: ativas primeiro, depois as expiradas. */
export async function GET() {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const inboxes = await composeInboxUseCases().list.execute({ ownerId: auth.member.id });
  return jsonNoStore({ inboxes });
}

/**
 * Cria uma Caixa. Corpo opcional: `{ "address": "meu-nome", "mascot": "polvo" }`;
 * sem `address`, o endereço é aleatório; sem `mascot`, o mascote é sorteado. Se o endereço é seu e está expirado, a Caixa é
 * reativada (resposta 200, `reactivated: true`).
 */
export async function POST(request: Request) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const parsed = await readJsonObject(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const { address, mascot } = parsed.body;
  if (address !== undefined && typeof address !== "string") {
    return badRequest('"address" precisa ser um texto.');
  }
  if (mascot !== undefined && !isMascotId(mascot)) {
    return badRequest('"mascot" precisa ser um dos mascotes (hermes, corvo, pomba…).');
  }

  const result = await composeInboxUseCases().create.execute({
    ownerId: auth.member.id,
    address,
    mascot,
  });
  if (!result.ok) return inboxErrorResponse(result.error);

  return jsonNoStore(result.value, result.value.reactivated ? 200 : 201);
}
