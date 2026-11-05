import type { ApiResult } from "@/shared/http/apiClient";
import type { MessageDetailView, MessageSummaryView } from "./MessageView";
import type { EmailHeader } from "./ports";

/** O que a página precisa das Mensagens, pela API (os casos de uso rodam no servidor). */
export interface MessageGateway {
  list(inboxId: string): Promise<ApiResult<MessageSummaryView[]>>;
  get(messageId: string): Promise<ApiResult<MessageDetailView>>;
  headers(messageId: string): Promise<ApiResult<EmailHeader[]>>;
  /** Links de download (o navegador baixa direto, com a sessão). */
  rawUrl(messageId: string): string;
  attachmentUrl(messageId: string, index: number): string;
}
