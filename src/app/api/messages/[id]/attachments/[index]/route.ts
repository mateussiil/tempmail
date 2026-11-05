import { authenticateMember } from "@/composition/api";
import { badRequest } from "@/composition/http";
import { composeRawMessageReaders, downloadResponse, rawMessageErrorResponse } from "@/composition/receiving";

type Context = { params: Promise<{ id: string; index: string }> };

/**
 * Baixa o anexo de posição `index` (a mesma ordem de `attachments` em
 * `GET /api/messages/{id}`), extraído do `.eml` na hora.
 */
export async function GET(_request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const { id, index } = await params;
  const position = Number(index);
  if (!Number.isInteger(position) || position < 0) return badRequest("A posição do anexo precisa ser um número.");

  const readers = composeRawMessageReaders();
  if ("response" in readers) return readers.response;

  const result = await readers.attachment.execute({ ownerId: auth.member.id, messageId: id, index: position });
  if (!result.ok) return rawMessageErrorResponse(result.error);

  return downloadResponse(result.value.bytes, result.value.filename, result.value.contentType);
}
