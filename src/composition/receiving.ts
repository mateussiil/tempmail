import { DrizzleInboxRepository } from "@/modules/inbox/infrastructure/DrizzleInboxRepository";
import { GetMessageUseCase } from "@/modules/message/application/GetMessageUseCase";
import {
  GetAttachmentUseCase,
  GetMessageHeadersUseCase,
  GetRawMessageUseCase,
  type RawMessageError,
} from "@/modules/message/application/RawMessageUseCases";
import { ListMessagesUseCase } from "@/modules/message/application/ListMessagesUseCase";
import { ReceiveEmailUseCase } from "@/modules/message/application/ReceiveEmailUseCase";
import { DrizzleMessageRepository } from "@/modules/message/infrastructure/DrizzleMessageRepository";
import { MailparserEmailParser } from "@/modules/message/infrastructure/MailparserEmailParser";
import { HttpRawEmailDownloader } from "@/modules/message/infrastructure/HttpRawEmailDownloader";
import { ResendReceivedEmailSource } from "@/modules/message/infrastructure/ResendReceivedEmailSource";
import { createR2Client, S3RawEmailStore } from "@/modules/message/infrastructure/S3RawEmailStore";
import { SvixWebhookVerifier } from "@/modules/message/infrastructure/SvixWebhookVerifier";
import {
  mailDomain,
  maxMessageBytes,
  missingR2Env,
  requireEnv,
  resendApiUrl,
  webhookDebugEnabled,
} from "@/shared/config/env";
import { getDb } from "@/shared/db/client";
import { jsonNoStore } from "./http";
import { InboxRepositoryDirectory } from "./inboxDirectory";

/** Log em uma linha de JSON, fácil de achar nos logs do Coolify. */
export function logEvent(event: string, data: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}

/** Só com WEBHOOK_DEBUG_LOG=true: registra o conteúdo cru (use com emails de teste). */
export function debugLog(label: string, data: Record<string, unknown>): void {
  if (webhookDebugEnabled()) logEvent(`debug.${label}`, data);
}

export function inboxDirectory() {
  return new InboxRepositoryDirectory(new DrizzleInboxRepository(getDb()), () => new Date());
}

export function composeWebhookVerifier(): SvixWebhookVerifier {
  return new SvixWebhookVerifier(requireEnv("RESEND_WEBHOOK_SECRET"));
}

/** Exige as variáveis do recebimento (a rota confere `missingReceivingEnv` antes). */
export function composeReceiveEmail(): ReceiveEmailUseCase {
  const baseUrl = resendApiUrl();

  return new ReceiveEmailUseCase({
    directory: inboxDirectory(),
    source: new ResendReceivedEmailSource({
      apiKey: requireEnv("RESEND_API_KEY"),
      baseUrl,
      debug: debugLog,
    }),
    downloader: new HttpRawEmailDownloader({ allowInsecure: baseUrl.startsWith("http://") }),
    store: r2Store(),
    repository: new DrizzleMessageRepository(getDb()),
    mailDomain: mailDomain(),
    maxMessageBytes: maxMessageBytes(),
    clock: () => new Date(),
    log: logEvent,
  });
}

/** Leitura das Mensagens: só precisa do banco (nada de R2 nem Resend). */
export function composeMessageReaders() {
  const deps = { directory: inboxDirectory(), repository: new DrizzleMessageRepository(getDb()) };
  return { list: new ListMessagesUseCase(deps), get: new GetMessageUseCase(deps) };
}

function r2Store(): S3RawEmailStore {
  return new S3RawEmailStore({
    client: createR2Client({
      endpoint: requireEnv("R2_ENDPOINT"),
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    }),
    bucket: requireEnv("R2_BUCKET"),
  });
}

/**
 * Leitura do `.eml` (download, cabeçalhos e anexos): precisa do R2. Sem as
 * variáveis, devolve a resposta `503` pronta em vez dos casos de uso.
 */
export function composeRawMessageReaders():
  | { response: Response }
  | { raw: GetRawMessageUseCase; headers: GetMessageHeadersUseCase; attachment: GetAttachmentUseCase } {
  const missing = missingR2Env();
  if (missing.length > 0) {
    return {
      response: jsonNoStore(
        { error: "storage_not_configured", message: "O armazenamento dos emails ainda não foi configurado.", missing },
        503,
      ),
    };
  }

  const deps = {
    directory: inboxDirectory(),
    repository: new DrizzleMessageRepository(getDb()),
    reader: r2Store(),
    parser: new MailparserEmailParser(),
  };
  return {
    raw: new GetRawMessageUseCase(deps),
    headers: new GetMessageHeadersUseCase(deps),
    attachment: new GetAttachmentUseCase(deps),
  };
}

export function rawMessageErrorResponse(error: RawMessageError): Response {
  const messages: Record<RawMessageError["code"], string> = {
    not_found: "Mensagem não encontrada.",
    no_raw: "O email original desta Mensagem não foi guardado (cota do provedor ou tamanho).",
    attachment_not_found: "Anexo não encontrado.",
  };
  return jsonNoStore({ error: error.code, message: messages[error.code] }, 404);
}

/**
 * Resposta de download de conteúdo de terceiros: sempre como arquivo, sem o
 * navegador adivinhar o tipo e, se for aberto, sem rodar nada na origem do app.
 */
export function downloadResponse(bytes: Uint8Array, filename: string, contentType: string): Response {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
