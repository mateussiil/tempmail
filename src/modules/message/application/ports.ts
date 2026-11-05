import type { Result } from "@/shared/result";
import type { AttachmentMeta, Message } from "../domain/Message";

/** Falha passageira (rede, 429, 5xx): o webhook responde erro e o Resend reenvia depois. */
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientError";
  }
}

/** Configuração errada (chave sem permissão, por exemplo): precisa de uma pessoa, mas também vira reenvio. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/** O email completo, como a API do Resend entrega. */
export type EmailContent = {
  id: string;
  /** Só o endereço. */
  from: string;
  /** O cabeçalho `From` com o nome, se veio. */
  fromHeader: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  messageId: string | null;
  /** Link (que expira em cerca de 1 h) do `.eml` completo. */
  rawDownloadUrl: string | null;
  attachments: AttachmentMeta[];
  receivedAt: Date | null;
};

export type FetchEmailError =
  /** Chegou com a cota do Resend estourada: o conteúdo se perdeu. */
  | { code: "quota_exceeded" }
  /** O Resend não conhece esse email. */
  | { code: "not_found" };

export interface ReceivedEmailSource {
  /** Lança `TransientError` ou `ConfigurationError` nas falhas que valem nova tentativa. */
  fetch(emailId: string): Promise<Result<EmailContent, FetchEmailError>>;
}

export type RawDownload = { ok: true; bytes: Uint8Array } | { ok: false; reason: "too_large" };

export interface RawEmailDownloader {
  /** Lança `TransientError` se o download falhar. */
  download(url: string, maxBytes: number): Promise<RawDownload>;
}

export interface RawEmailStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export interface MessageRepository {
  /**
   * Grava a Mensagem e avisa quem escuta (NOTIFY). `false` se já existia: o
   * mesmo email na mesma Caixa nunca é gravado duas vezes.
   */
  insert(message: Message): Promise<boolean>;
  existingIds(ids: string[]): Promise<Set<string>>;
  /** As mais recentes primeiro. */
  listByInbox(inboxId: string, limit: number): Promise<Message[]>;
  findById(id: string): Promise<Message | null>;
}

export type DirectoryInbox = { id: string; address: string; active: boolean };

/** O que este módulo precisa saber das Caixas (que são de outro módulo). */
export interface InboxDirectory {
  /** Em qualquer estado; quem chama olha `active`. Endereços já normalizados. */
  findByAddresses(addresses: string[]): Promise<DirectoryInbox[]>;
  /** A Caixa só existe para quem a consulta se for dele. */
  findOwned(ownerId: string, inboxId: string): Promise<DirectoryInbox | null>;
}
