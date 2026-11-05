import { DrizzleInboxRepository } from "@/modules/inbox/infrastructure/DrizzleInboxRepository";
import { GetMessageUseCase } from "@/modules/message/application/GetMessageUseCase";
import { ListMessagesUseCase } from "@/modules/message/application/ListMessagesUseCase";
import { ReceiveEmailUseCase } from "@/modules/message/application/ReceiveEmailUseCase";
import { DrizzleMessageRepository } from "@/modules/message/infrastructure/DrizzleMessageRepository";
import { HttpRawEmailDownloader } from "@/modules/message/infrastructure/HttpRawEmailDownloader";
import { ResendReceivedEmailSource } from "@/modules/message/infrastructure/ResendReceivedEmailSource";
import { createR2Client, S3RawEmailStore } from "@/modules/message/infrastructure/S3RawEmailStore";
import { SvixWebhookVerifier } from "@/modules/message/infrastructure/SvixWebhookVerifier";
import {
  mailDomain,
  maxMessageBytes,
  requireEnv,
  resendApiUrl,
  webhookDebugEnabled,
} from "@/shared/config/env";
import { getDb } from "@/shared/db/client";
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
    store: new S3RawEmailStore({
      client: createR2Client({
        endpoint: requireEnv("R2_ENDPOINT"),
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      }),
      bucket: requireEnv("R2_BUCKET"),
    }),
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
