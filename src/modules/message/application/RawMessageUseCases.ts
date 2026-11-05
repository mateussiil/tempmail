import { fail, ok, type Result } from "@/shared/result";
import type { AttachmentMeta, Message } from "../domain/Message";
import type {
  EmailAttachment,
  EmailHeader,
  EmailParser,
  InboxDirectory,
  MessageRepository,
  RawEmailReader,
} from "./ports";

export type RawMessageError =
  /** Não existe, é de outro Membro ou a Caixa expirou (as três parecem iguais de fora). */
  | { code: "not_found" }
  /** A Mensagem existe, mas o `.eml` não foi guardado (cota do Resend ou tamanho). */
  | { code: "no_raw" }
  /** O `.eml` não tem esse anexo. */
  | { code: "attachment_not_found" };

type Deps = {
  directory: InboxDirectory;
  repository: MessageRepository;
  reader: RawEmailReader;
  parser: EmailParser;
};

/** A Mensagem e o seu `.eml`, só para o Dono de uma Caixa ativa. */
async function loadRaw(
  deps: Deps,
  ownerId: string,
  messageId: string,
): Promise<Result<{ message: Message; raw: Uint8Array }, RawMessageError>> {
  const message = await deps.repository.findById(messageId);
  if (!message) return fail({ code: "not_found" });

  const inbox = await deps.directory.findOwned(ownerId, message.inboxId);
  if (!inbox || !inbox.active) return fail({ code: "not_found" });
  if (!message.rawKey) return fail({ code: "no_raw" });

  const raw = await deps.reader.get(message.rawKey);
  if (!raw) return fail({ code: "no_raw" });
  return ok({ message, raw });
}

/** Nome de arquivo seguro para o `.eml`: o assunto, sem caracteres estranhos. */
export function emlFilename(subject: string): string {
  const base = subject
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "mensagem"}.eml`;
}

/** O `.eml` completo, para baixar. */
export class GetRawMessageUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: {
    ownerId: string;
    messageId: string;
  }): Promise<Result<{ filename: string; bytes: Uint8Array }, RawMessageError>> {
    const loaded = await loadRaw(this.deps, input.ownerId, input.messageId);
    if (!loaded.ok) return loaded;
    return ok({ filename: emlFilename(loaded.value.message.subject), bytes: loaded.value.raw });
  }
}

/** Os cabeçalhos do email, na ordem em que vieram. */
export class GetMessageHeadersUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: { ownerId: string; messageId: string }): Promise<Result<EmailHeader[], RawMessageError>> {
    const loaded = await loadRaw(this.deps, input.ownerId, input.messageId);
    if (!loaded.ok) return loaded;
    const { headers } = await this.deps.parser.parse(loaded.value.raw);
    return ok(headers);
  }
}

/**
 * Acha no `.eml` o anexo de posição `index` da lista guardada (a que a página
 * mostra). Casa pelo nome e tamanho; se o nome não bater, usa a mesma posição.
 */
export function pickAttachment(
  listed: AttachmentMeta[],
  parsed: EmailAttachment[],
  index: number,
): EmailAttachment | null {
  const meta = listed[index];
  if (!meta) return null;

  const sameName = parsed.filter((a) => meta.filename !== null && a.filename === meta.filename);
  if (sameName.length === 1) return sameName[0];
  if (sameName.length > 1) return sameName.find((a) => a.size === meta.size) ?? sameName[0];
  return parsed[index] ?? null;
}

/** Um anexo, extraído do `.eml` na hora (os bytes não são guardados à parte). */
export class GetAttachmentUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: {
    ownerId: string;
    messageId: string;
    index: number;
  }): Promise<Result<{ filename: string; contentType: string; bytes: Uint8Array }, RawMessageError>> {
    const loaded = await loadRaw(this.deps, input.ownerId, input.messageId);
    if (!loaded.ok) return loaded;

    const { attachments } = await this.deps.parser.parse(loaded.value.raw);
    const found = pickAttachment(loaded.value.message.attachments, attachments, input.index);
    if (!found) return fail({ code: "attachment_not_found" });

    return ok({
      filename: found.filename ?? loaded.value.message.attachments[input.index]?.filename ?? `anexo-${input.index + 1}`,
      contentType: found.contentType || "application/octet-stream",
      bytes: found.content,
    });
  }
}
