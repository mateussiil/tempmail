import { authenticateMember } from "@/composition/api";
import { jsonNoStore } from "@/composition/http";
import { composeMessageReaders } from "@/composition/receiving";

type Context = { params: Promise<{ id: string }> };

/**
 * As Mensagens de uma Caixa, as mais recentes primeiro e sem o corpo.
 * `?limit=` de 1 a 100 (50 por padrão).
 */
export async function GET(request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null || rawLimit.trim() === "" ? undefined : Number(rawLimit);
  if (limit !== undefined && !Number.isInteger(limit)) {
    return jsonNoStore({ error: "invalid_limit", message: '"limit" precisa ser um número inteiro.' }, 400);
  }

  const { id } = await params;
  const result = await composeMessageReaders().list.execute({
    ownerId: auth.member.id,
    inboxId: id,
    limit,
  });
  if (!result.ok) return jsonNoStore({ error: "not_found", message: "Caixa não encontrada." }, 404);

  return jsonNoStore({ messages: result.value });
}
