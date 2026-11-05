import { fail, ok, type Result } from "@/shared/result";
import type { InboxDirectory, MessageRepository } from "./ports";
import { toSummaryView, type MessageSummaryView } from "./MessageView";

export type MessageError = { code: "not_found" };

export const DEFAULT_MESSAGE_LIMIT = 50;
export const MAX_MESSAGE_LIMIT = 100;

/**
 * As Mensagens de uma Caixa do Membro, as mais recentes primeiro, sem o corpo.
 * Uma Caixa expirada não tem mais Mensagens: devolve lista vazia, mesmo que a
 * limpeza do banco ainda não tenha passado.
 */
export class ListMessagesUseCase {
  constructor(
    private readonly deps: { directory: InboxDirectory; repository: MessageRepository },
  ) {}

  async execute(input: {
    ownerId: string;
    inboxId: string;
    limit?: number;
  }): Promise<Result<MessageSummaryView[], MessageError>> {
    const inbox = await this.deps.directory.findOwned(input.ownerId, input.inboxId);
    if (!inbox) return fail({ code: "not_found" });
    if (!inbox.active) return ok([]);

    const limit = Math.min(Math.max(input.limit ?? DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);
    const messages = await this.deps.repository.listByInbox(inbox.id, limit);
    return ok(messages.map(toSummaryView));
  }
}
