import type { ApiResult } from "@/shared/http/apiClient";
import { GetMessageUseCase } from "../application/GetMessageUseCase";
import { ListMessagesUseCase } from "../application/ListMessagesUseCase";
import type { MessageGateway } from "../application/MessageGateway";
import type { EmailHeader, InboxDirectory } from "../application/ports";
import { FakeMessageRepository } from "./fakes";

const notFound = { status: 404, code: "not_found", message: "Mensagem não encontrada.", details: {} };

/** As Mensagens em memória, pelos casos de uso de leitura reais. */
export class FakeMessageGateway implements MessageGateway {
  readonly repository = new FakeMessageRepository();
  headerLines: EmailHeader[] = [
    { name: "From", value: "GitHub <noreply@github.com>" },
    { name: "Subject", value: "Seu código de verificação" },
  ];
  calls: string[] = [];

  constructor(
    private readonly directory: InboxDirectory,
    private readonly ownerId = "ana",
  ) {}

  async list(inboxId: string) {
    this.calls.push(`list:${inboxId}`);
    const result = await new ListMessagesUseCase({ directory: this.directory, repository: this.repository }).execute({
      ownerId: this.ownerId,
      inboxId,
    });
    return result.ok ? result : ({ ok: false, error: { ...notFound, message: "Caixa não encontrada." } } as const);
  }

  async get(messageId: string) {
    this.calls.push(`get:${messageId}`);
    const result = await new GetMessageUseCase({ directory: this.directory, repository: this.repository }).execute({
      ownerId: this.ownerId,
      messageId,
    });
    return result.ok ? result : ({ ok: false, error: notFound } as const);
  }

  async headers(messageId: string): Promise<ApiResult<EmailHeader[]>> {
    this.calls.push(`headers:${messageId}`);
    return { ok: true, value: this.headerLines };
  }

  rawUrl(messageId: string) {
    return `/api/messages/${messageId}/raw`;
  }

  attachmentUrl(messageId: string, index: number) {
    return `/api/messages/${messageId}/attachments/${index}`;
  }
}
