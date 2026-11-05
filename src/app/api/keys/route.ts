import { authenticateSession } from "@/composition/api";
import { composeApiKeyUseCases } from "@/composition/apiKeys";
import { badRequest, jsonNoStore, readJsonObject } from "@/composition/http";
import { MAX_API_KEY_NAME_LENGTH } from "@/modules/membership/application/ApiKeyUseCases";

/** As Chaves de API do Membro (sem o segredo, que só aparece na criação). Só por sessão. */
export async function GET() {
  const auth = await authenticateSession();
  if ("response" in auth) return auth.response;

  return jsonNoStore({ keys: await composeApiKeyUseCases().list.execute({ memberId: auth.member.id }) });
}

/**
 * Cria uma chave: `{ "name": "meu-script" }`. A resposta traz `token`, o segredo
 * completo, uma única vez; guarde-o, porque não dá para ler de novo. Só por sessão.
 */
export async function POST(request: Request) {
  const auth = await authenticateSession();
  if ("response" in auth) return auth.response;

  const parsed = await readJsonObject(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;

  const { name } = parsed.body;
  if (typeof name !== "string") return badRequest('"name" precisa ser um texto.');

  const result = await composeApiKeyUseCases().create.execute({ memberId: auth.member.id, name });
  if (!result.ok) {
    return jsonNoStore(
      {
        error: "invalid_name",
        message: `Dê um nome de 1 a ${MAX_API_KEY_NAME_LENGTH} caracteres.`,
      },
      400,
    );
  }

  return jsonNoStore(result.value, 201);
}
