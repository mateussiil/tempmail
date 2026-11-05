import { fail, ok, type Result } from "@/shared/result";
import {
  ConfigurationError,
  TransientError,
  type EmailContent,
  type FetchEmailError,
  type ReceivedEmailSource,
} from "../application/ports";
import { splitAddress } from "../application/ReceivedEmailEvent";
import type { AttachmentMeta } from "../domain/Message";

type Options = {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Para inspecionar a resposta crua do Resend (só com WEBHOOK_DEBUG_LOG). */
  debug?: (label: string, data: Record<string, unknown>) => void;
};

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

function bareAddress(raw: string): string {
  const parts = splitAddress(raw);
  return parts ? `${parts.local}@${parts.domain}` : raw.trim().toLowerCase();
}

function parseAttachments(value: unknown): AttachmentMeta[] {
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
        size: typeof a.size === "number" ? a.size : null,
      },
    ];
  });
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** O `From` com o nome fica em `headers.from` (as chaves podem vir em qualquer caixa). */
function fromHeaderOf(headers: unknown): string | null {
  if (typeof headers !== "object" || headers === null) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "from" && typeof value === "string") return value;
  }
  return null;
}

function toEmailContent(json: unknown): EmailContent | null {
  if (typeof json !== "object" || json === null) return null;
  const body = json as Record<string, unknown>;

  const id = asString(body.id);
  const from = asString(body.from);
  if (!id || !from) return null;

  const raw = typeof body.raw === "object" && body.raw !== null ? (body.raw as Record<string, unknown>) : {};

  return {
    id,
    from: bareAddress(from),
    fromHeader: fromHeaderOf(body.headers) ?? (from.includes("<") ? from : null),
    subject: asString(body.subject) ?? "",
    html: asString(body.html),
    text: asString(body.text),
    messageId: asString(body.message_id),
    rawDownloadUrl: asString(raw.download_url),
    attachments: parseAttachments(body.attachments),
    receivedAt: parseDate(body.created_at),
  };
}

/** O nome do erro vem em `name` (ou `error.name`); o corpo pode nem ser JSON. */
function errorName(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { name?: unknown; error?: { name?: unknown } };
    return asString(parsed.name) ?? asString(parsed.error?.name);
  } catch {
    return null;
  }
}

/** Busca o email recebido na API do Resend: `GET /emails/receiving/{id}`. */
export class ResendReceivedEmailSource implements ReceivedEmailSource {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: Options) {
    this.baseUrl = (options.baseUrl ?? "https://api.resend.com").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async fetch(emailId: string): Promise<Result<EmailContent, FetchEmailError>> {
    let response: Response;
    let bodyText: string;
    try {
      response = await this.fetchFn(`${this.baseUrl}/emails/receiving/${encodeURIComponent(emailId)}`, {
        headers: { Authorization: `Bearer ${this.options.apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      bodyText = await response.text();
    } catch (error) {
      throw new TransientError(`Falha de rede ao buscar o email no Resend: ${String(error)}`);
    }

    this.options.debug?.("resend.api.response", { emailId, status: response.status, body: bodyText });

    if (response.ok) {
      let json: unknown;
      try {
        json = JSON.parse(bodyText);
      } catch {
        throw new TransientError("O Resend devolveu uma resposta que não é JSON");
      }
      const content = toEmailContent(json);
      if (!content) throw new TransientError("O Resend devolveu um email sem id ou remetente");
      return ok(content);
    }

    const name = errorName(bodyText);
    const { status } = response;

    // Chegou com a cota estourada: o Resend não guardou o conteúdo, e nenhuma nova tentativa muda isso.
    if (status === 403 && name === "email_above_quota") return fail({ code: "quota_exceeded" });
    // Id desconhecido ou malformado: reenviar o aviso não adianta.
    if (status === 404 || status === 400 || status === 422) return fail({ code: "not_found" });

    if (status === 401 || status === 403) {
      throw new ConfigurationError(
        `O Resend recusou a chave de API (${status}${name ? ` ${name}` : ""}). ` +
          "Para buscar emails recebidos a chave precisa ter acesso total, não só de envio.",
      );
    }

    // 429 (limite de requisições), 5xx e qualquer outra coisa: tenta de novo mais tarde.
    throw new TransientError(`O Resend respondeu ${status}${name ? ` ${name}` : ""}`);
  }
}
