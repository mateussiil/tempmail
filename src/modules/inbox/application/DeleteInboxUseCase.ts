import { fail, ok, type Result } from "@/shared/result";
import { findOwnedInbox, type InboxDeps } from "./InboxDeps";
import type { InboxError } from "./InboxError";
import { toInboxView, type InboxView } from "./InboxView";

/** Apagar é expirar agora (inclusive uma Caixa mantida). Repetir não faz mal. */
export class DeleteInboxUseCase {
  constructor(private readonly deps: InboxDeps) {}

  async execute(input: { ownerId: string; inboxId: string }): Promise<Result<InboxView, InboxError>> {
    const now = this.deps.clock();

    const inbox = await findOwnedInbox(this.deps, input.ownerId, input.inboxId);
    if (!inbox) return fail({ code: "not_found" });

    const expired = inbox.expire(now);
    if (expired !== inbox) await this.deps.repository.save(expired);

    return ok(toInboxView(expired, now, this.deps.mailDomain));
  }
}
