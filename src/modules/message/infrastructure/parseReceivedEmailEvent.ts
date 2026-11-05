import type { ReceivedEmailEvent } from "../application/ReceivedEmailEvent";
import type { AttachmentMeta } from "../domain/Message";

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function attachments(value: unknown): AttachmentMeta[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AttachmentMeta[] => {
    if (typeof item !== "object" || item === null) return [];
    const a = item as Record<string, unknown>;
    const id = asString(a.id);
    if (!id) return [];
    return [
      {
        id,
        filename: asString(a.filename),
        contentType: asString(a.content_type),
        contentDisposition: asString(a.content_disposition),
        contentId: asString(a.content_id),
        size: null, // o aviso não traz o tamanho
      },
    ];
  });
}

/**
 * Lê o corpo de um aviso `email.received` (já verificado). Devolve `null` se
 * faltar o id do email ou o remetente.
 */
export function parseReceivedEmailEvent(body: unknown): ReceivedEmailEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;

  const emailId = asString(d.email_id);
  const from = asString(d.from);
  if (!emailId || !from) return null;

  const createdAt = asString(d.created_at);
  const receivedAt = createdAt ? new Date(createdAt) : null;

  return {
    emailId,
    from,
    to: strings(d.to),
    cc: strings(d.cc),
    bcc: strings(d.bcc),
    receivedFor: strings(d.received_for),
    subject: asString(d.subject) ?? "",
    messageId: asString(d.message_id),
    receivedAt: receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : null,
    attachments: attachments(d.attachments),
  };
}
