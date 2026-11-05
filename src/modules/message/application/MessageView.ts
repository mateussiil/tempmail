import type { AttachmentMeta, Message, MessageStatus } from "../domain/Message";

/** Item de lista: sem corpo, leve para o polling. */
export type MessageSummaryView = {
  id: string;
  inboxId: string;
  /** O remetente como aparece: `GitHub <noreply@github.com>` ou só o endereço. */
  from: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  verificationCode: string | null;
  status: MessageStatus;
  attachmentCount: number;
};

export type MessageDetailView = MessageSummaryView & {
  /** Conteúdo de terceiros: nunca renderizar sem isolamento (iframe com sandbox). */
  text: string | null;
  html: string | null;
  messageId: string | null;
  attachments: AttachmentMeta[];
  /** O `.eml` completo está guardado. */
  hasRaw: boolean;
};

export function toSummaryView(message: Message): MessageSummaryView {
  return {
    id: message.id,
    inboxId: message.inboxId,
    from: message.fromHeader ?? message.fromAddress,
    fromAddress: message.fromAddress,
    subject: message.subject,
    receivedAt: message.receivedAt.toISOString(),
    verificationCode: message.verificationCode,
    status: message.status,
    attachmentCount: message.attachments.length,
  };
}

export function toDetailView(message: Message): MessageDetailView {
  return {
    ...toSummaryView(message),
    text: message.textBody,
    html: message.htmlBody,
    messageId: message.messageId,
    attachments: message.attachments,
    hasRaw: message.rawKey !== null,
  };
}
