import { authenticateMember } from "@/composition/api";
import { jsonNoStore } from "@/composition/http";
import { composeRawMessageReaders, rawMessageErrorResponse } from "@/composition/receiving";

type Context = { params: Promise<{ id: string }> };

/** Os cabeçalhos do email original, na ordem: `{ headers: [{ name, value }] }`. */
export async function GET(_request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const readers = composeRawMessageReaders();
  if ("response" in readers) return readers.response;

  const { id } = await params;
  const result = await readers.headers.execute({ ownerId: auth.member.id, messageId: id });
  if (!result.ok) return rawMessageErrorResponse(result.error);

  return jsonNoStore({ headers: result.value });
}
