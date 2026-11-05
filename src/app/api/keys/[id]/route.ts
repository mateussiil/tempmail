import { authenticateSession } from "@/composition/api";
import { composeApiKeyUseCases } from "@/composition/apiKeys";
import { jsonNoStore } from "@/composition/http";

type Context = { params: Promise<{ id: string }> };

/** Revoga a chave: ela deixa de valer no pedido seguinte. Repetir não faz mal. Só por sessão. */
export async function DELETE(_request: Request, { params }: Context) {
  const auth = await authenticateSession();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await composeApiKeyUseCases().revoke.execute({ memberId: auth.member.id, keyId: id });
  if (!result.ok) {
    return jsonNoStore({ error: "not_found", message: "Chave não encontrada." }, 404);
  }

  return jsonNoStore({ revoked: true });
}
