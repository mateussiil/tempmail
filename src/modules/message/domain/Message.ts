import { createHash } from "node:crypto";
import { extractVerificationCode } from "./verificationCode";

/** Metadados de um anexo. Os bytes ficam dentro do `.eml` e são extraídos no download. */
export type AttachmentMeta = {
  id: string;
  filename: string | null;
  contentType: string | null;
  contentDisposition: string | null;
  contentId: string | null;
  size: number | null;
};

/**
 * - `ready`: corpo e `.eml` guardados;
 * - `quota_exceeded`: o Resend não entregou o conteúdo (cota estourada na chegada);
 * - `too_large`: passou do tamanho máximo, só os metadados foram guardados.
 */
export type MessageStatus = "ready" | "quota_exceeded" | "too_large";

type Common = {
  inboxId: string;
  emailId: string;
  messageId: string | null;
  fromAddress: string;
  subject: string;
  attachments: AttachmentMeta[];
  receivedAt: Date;
  createdAt: Date;
};

/** Mensagem: um email recebido por uma Caixa (ver `CONTEXT.md`). */
export class Message {
  private constructor(
    readonly id: string,
    readonly inboxId: string,
    /** Id do email no Resend: a chave da idempotência do webhook. */
    readonly emailId: string,
    /** Cabeçalho Message-ID do email (RFC). */
    readonly messageId: string | null,
    /** Só o endereço, ex.: `noreply@github.com`. */
    readonly fromAddress: string,
    /** O cabeçalho completo, ex.: `GitHub <noreply@github.com>`. */
    readonly fromHeader: string | null,
    readonly subject: string,
    readonly textBody: string | null,
    readonly htmlBody: string | null,
    readonly verificationCode: string | null,
    readonly status: MessageStatus,
    /** Chave do `.eml` no R2; nula quando não foi guardado. */
    readonly rawKey: string | null,
    readonly rawSize: number | null,
    readonly attachments: AttachmentMeta[],
    readonly receivedAt: Date,
    readonly createdAt: Date,
  ) {}

  /**
   * O id é derivado do email e da Caixa: reenviar o mesmo webhook gera o mesmo
   * id (então o insert é idempotente) e o mesmo caminho no R2 (então uma nova
   * tentativa sobrescreve o arquivo em vez de deixar um órfão).
   */
  static idFor(emailId: string, inboxId: string): string {
    return createHash("sha256").update(`${emailId}:${inboxId}`).digest("hex").slice(0, 32);
  }

  static rawKeyFor(inboxId: string, messageId: string): string {
    return `caixas/${inboxId}/${messageId}.eml`;
  }

  static ready(
    input: Common & {
      fromHeader: string | null;
      textBody: string | null;
      htmlBody: string | null;
      rawKey: string | null;
      rawSize: number | null;
    },
  ): Message {
    return new Message(
      Message.idFor(input.emailId, input.inboxId),
      input.inboxId,
      input.emailId,
      input.messageId,
      input.fromAddress,
      input.fromHeader,
      input.subject,
      input.textBody,
      input.htmlBody,
      extractVerificationCode({
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody,
      }),
      "ready",
      input.rawKey,
      input.rawSize,
      input.attachments,
      input.receivedAt,
      input.createdAt,
    );
  }

  /** Mensagem sem corpo: só o que o webhook trouxe (remetente, assunto, anexos). */
  static withoutContent(input: Common, status: "quota_exceeded" | "too_large"): Message {
    return new Message(
      Message.idFor(input.emailId, input.inboxId),
      input.inboxId,
      input.emailId,
      input.messageId,
      input.fromAddress,
      null,
      input.subject,
      null,
      null,
      null,
      status,
      null,
      null,
      input.attachments,
      input.receivedAt,
      input.createdAt,
    );
  }

  /** Remonta uma Mensagem já gravada, sem recalcular nada. */
  static restore(fields: {
    id: string;
    inboxId: string;
    emailId: string;
    messageId: string | null;
    fromAddress: string;
    fromHeader: string | null;
    subject: string;
    textBody: string | null;
    htmlBody: string | null;
    verificationCode: string | null;
    status: MessageStatus;
    rawKey: string | null;
    rawSize: number | null;
    attachments: AttachmentMeta[];
    receivedAt: Date;
    createdAt: Date;
  }): Message {
    return new Message(
      fields.id,
      fields.inboxId,
      fields.emailId,
      fields.messageId,
      fields.fromAddress,
      fields.fromHeader,
      fields.subject,
      fields.textBody,
      fields.htmlBody,
      fields.verificationCode,
      fields.status,
      fields.rawKey,
      fields.rawSize,
      fields.attachments,
      fields.receivedAt,
      fields.createdAt,
    );
  }
}
