import { simpleParser } from "mailparser";
import type { EmailAttachment, EmailHeader, EmailParser } from "../application/ports";

/** Abre o `.eml` com o `mailparser`: cabeçalhos crus, na ordem, e os anexos com os bytes. */
export class MailparserEmailParser implements EmailParser {
  async parse(raw: Uint8Array): Promise<{ headers: EmailHeader[]; attachments: EmailAttachment[] }> {
    const parsed = await simpleParser(Buffer.from(raw), { skipHtmlToText: true, skipTextToHtml: true });

    const headers = parsed.headerLines.map((line) => {
      const colon = line.line.indexOf(":");
      return {
        name: colon > 0 ? line.line.slice(0, colon).trim() : line.key,
        // Junta as continuações (linhas dobradas) num valor só.
        value: (colon > 0 ? line.line.slice(colon + 1) : line.line).replace(/\r?\n[ \t]+/g, " ").trim(),
      };
    });

    const attachments = parsed.attachments.map((attachment) => ({
      filename: attachment.filename ?? null,
      contentType: attachment.contentType,
      size: attachment.size,
      content: new Uint8Array(attachment.content),
    }));

    return { headers, attachments };
  }
}
