import type { AttachmentMeta } from "../domain/Message";

/** O aviso `email.received` do Resend: só metadados, sem corpo nem tamanho dos anexos. */
export type ReceivedEmailEvent = {
  emailId: string;
  /** Só o endereço do remetente. */
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  receivedFor: string[];
  subject: string;
  messageId: string | null;
  receivedAt: Date | null;
  attachments: AttachmentMeta[];
};

/** `"Nome <a@b.com>"` ou `"a@b.com"` vira `{ local: "a", domain: "b.com" }`, em minúsculas. */
export function splitAddress(raw: string): { local: string; domain: string } | null {
  const angle = /<([^<>]+)>/.exec(raw);
  const address = (angle ? angle[1] : raw).trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  return { local: address.slice(0, at), domain: address.slice(at + 1) };
}

/**
 * Os endereços do nosso domínio que receberam o email, sem repetição.
 *
 * Prefere `received_for` (o destinatário do envelope SMTP, tirado do cabeçalho
 * `Received`). Esse campo vem vazio quando o email tem vários destinatários;
 * nesse caso usa os endereços visíveis (`to`, `cc` e `bcc`).
 */
export function pickRecipientAddresses(event: ReceivedEmailEvent, mailDomain: string): string[] {
  const candidates =
    event.receivedFor.length > 0
      ? event.receivedFor
      : [...event.to, ...event.cc, ...event.bcc];
  const domain = mailDomain.trim().toLowerCase();

  const locals = candidates
    .map(splitAddress)
    .filter((address): address is { local: string; domain: string } => address?.domain === domain)
    .map((address) => address.local);

  return [...new Set(locals)];
}
