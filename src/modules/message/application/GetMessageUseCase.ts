import { fail, ok, type Result } from "@/shared/result";
import type { MessageError } from "./ListMessagesUseCase";
import type { InboxDirectory, MessageRepository } from "./ports";
import { toDetailView, type MessageDetailView } from "./MessageView";

/**
 * Uma Mensagem completa. Só o Dono da Caixa a vê; a de outro Membro, uma
 * inexistente e uma de Caixa expirada respondem igual (`not_found`).
 */
export class GetMessageUseCase {
  constructor(
    private readonly deps: { directory: InboxDirectory; repository: MessageRepository },
  ) {}

  async execute(input: {
    ownerId: string;
    messageId: string;
  }): Promise<Result<MessageDetailView, MessageError>> {
    const message = await this.deps.repository.findById(input.messageId);
    if (!message) return fail({ code: "not_found" });

    const inbox = await this.deps.directory.findOwned(input.ownerId, message.inboxId);
    if (!inbox || !inbox.active) return fail({ code: "not_found" });

    return ok(toDetailView(message));
  }
}
