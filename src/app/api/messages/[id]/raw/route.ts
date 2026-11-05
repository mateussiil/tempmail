import { authenticateMember } from "@/composition/api";
import { composeRawMessageReaders, downloadResponse, rawMessageErrorResponse } from "@/composition/receiving";

type Context = { params: Promise<{ id: string }> };

/** Baixa o `.eml` completo da Mensagem. */
export async function GET(_request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const readers = composeRawMessageReaders();
  if ("response" in readers) return readers.response;

  const { id } = await params;
  const result = await readers.raw.execute({ ownerId: auth.member.id, messageId: id });
  if (!result.ok) return rawMessageErrorResponse(result.error);

  return downloadResponse(result.value.bytes, result.value.filename, "message/rfc822");
}
