import { authenticateMember } from "@/composition/api";
import { jsonNoStore } from "@/composition/http";
import { composeMessageReaders } from "@/composition/receiving";

type Context = { params: Promise<{ id: string }> };

/**
 * Uma Mensagem completa: texto, HTML, código de verificação e anexos.
 * O `html` é conteúdo de terceiros: quem for exibir precisa isolá-lo (iframe com sandbox).
 */
export async function GET(_request: Request, { params }: Context) {
  const auth = await authenticateMember();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await composeMessageReaders().get.execute({
    ownerId: auth.member.id,
    messageId: id,
  });
  if (!result.ok) return jsonNoStore({ error: "not_found", message: "Mensagem não encontrada." }, 404);

  return jsonNoStore({ message: result.value });
}
