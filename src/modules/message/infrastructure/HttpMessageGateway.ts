import { requestJson, type ApiResult, type FetchFn } from "@/shared/http/apiClient";
import type { MessageGateway } from "../application/MessageGateway";
import type { MessageDetailView, MessageSummaryView } from "../application/MessageView";
import type { EmailHeader } from "../application/ports";

const messageUrl = (id: string) => `/api/messages/${encodeURIComponent(id)}`;

/** As Mensagens pela API REST, com a sessão do navegador. */
export class HttpMessageGateway implements MessageGateway {
  constructor(private readonly fetchFn: FetchFn) {}

  async list(inboxId: string): Promise<ApiResult<MessageSummaryView[]>> {
    const result = await requestJson<{ messages: MessageSummaryView[] }>(
      this.fetchFn,
      `/api/inboxes/${encodeURIComponent(inboxId)}/messages`,
    );
    return result.ok ? { ok: true, value: result.value.messages } : result;
  }

  async get(messageId: string): Promise<ApiResult<MessageDetailView>> {
    const result = await requestJson<{ message: MessageDetailView }>(this.fetchFn, messageUrl(messageId));
    return result.ok ? { ok: true, value: result.value.message } : result;
  }

  async headers(messageId: string): Promise<ApiResult<EmailHeader[]>> {
    const result = await requestJson<{ headers: EmailHeader[] }>(this.fetchFn, `${messageUrl(messageId)}/headers`);
    return result.ok ? { ok: true, value: result.value.headers } : result;
  }

  rawUrl(messageId: string): string {
    return `${messageUrl(messageId)}/raw`;
  }

  attachmentUrl(messageId: string, index: number): string {
    return `${messageUrl(messageId)}/attachments/${index}`;
  }
}
