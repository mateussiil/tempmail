import { authenticateMember } from "@/composition/api";
import { badRequest, inboxErrorResponse, jsonNoStore, readJsonObject } from "@/composition/http";
import { composeInboxUseCases } from "@/composition/inbox";

type Context = { params: Promise<{ id: string }> };

/** Reativa uma Caixa expirada: volta vazia. Corpo opcional: `{ "keep": true }` para já manter. */
export async function POST(request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const parsed = await readJsonObject(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const { keep } = parsed.body;
  if (keep !== undefined && typeof keep !== "boolean") {
    return badRequest('"keep" precisa ser true ou false.');
  }

  const { id } = await params;
  const result = await composeInboxUseCases().reactivate.execute({
    ownerId: auth.member.id,
    inboxId: id,
    keep,
  });
  if (!result.ok) return inboxErrorResponse(result.error);

  return jsonNoStore({ inbox: result.value });
}
