import { authenticateMember } from "@/composition/api";
import { badRequest, inboxErrorResponse, jsonNoStore, readJsonObject } from "@/composition/http";
import { composeInboxUseCases } from "@/composition/inbox";
import { isMascotId } from "@/modules/inbox/domain/Mascot";

type Context = { params: Promise<{ id: string }> };

/**
 * Manter (`{ "kept": true }`, tira o prazo), deixar de manter (`{ "kept": false }`)
 * ou trocar o mascote (`{ "mascot": "polvo" }`).
 */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const parsed = await readJsonObject(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;

  const { kept, mascot } = parsed.body;
  const { id } = await params;

  if (mascot !== undefined) {
    if (!isMascotId(mascot)) return badRequest('"mascot" precisa ser um dos mascotes (hermes, corvo, pomba…).');
    const changed = await composeInboxUseCases().setMascot.execute({ ownerId: auth.member.id, inboxId: id, mascot });
    if (!changed.ok) return inboxErrorResponse(changed.error);
    if (kept === undefined) return jsonNoStore({ inbox: changed.value });
  }

  if (typeof kept !== "boolean") return badRequest('"kept" precisa ser true ou false.');

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
