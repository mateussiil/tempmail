import { authenticateMember } from "@/composition/api";
import { badRequest, inboxErrorResponse, jsonNoStore, readJsonObject } from "@/composition/http";
import { composeInboxUseCases } from "@/composition/inbox";

type Context = { params: Promise<{ id: string }> };

/** Manter (`{ "kept": true }`, tira o prazo) ou deixar de manter (`{ "kept": false }`). */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const parsed = await readJsonObject(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;

  const { kept } = parsed.body;
  if (typeof kept !== "boolean") return badRequest('"kept" precisa ser true ou false.');

  const { id } = await params;
  const result = await composeInboxUseCases().setKept.execute({
    ownerId: auth.member.id,
    inboxId: id,
    kept,
  });
  if (!result.ok) return inboxErrorResponse(result.error);

  return jsonNoStore({ inbox: result.value });
}

/** Apagar é expirar agora (inclusive uma Caixa mantida). Repetir não faz mal. */
export async function DELETE(_request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await composeInboxUseCases().remove.execute({
    ownerId: auth.member.id,
    inboxId: id,
  });
  if (!result.ok) return inboxErrorResponse(result.error);

  return jsonNoStore({ inbox: result.value });
}
