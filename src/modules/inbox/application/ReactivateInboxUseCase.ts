import { fail, ok, type Result } from "@/shared/result";
import { checkActiveLimit, findOwnedInbox, type InboxDeps } from "./InboxDeps";
import type { InboxError } from "./InboxError";
import { toInboxView, type InboxView } from "./InboxView";

/** Reativa uma Caixa expirada do Membro: volta vazia, com novo prazo (ou mantida). */
export class ReactivateInboxUseCase {
  constructor(private readonly deps: InboxDeps) {}

  async execute(input: {
    ownerId: string;
    inboxId: string;
    keep?: boolean;
  }): Promise<Result<InboxView, InboxError>> {
    const now = this.deps.clock();

    const inbox = await findOwnedInbox(this.deps, input.ownerId, input.inboxId);
    if (!inbox) return fail({ code: "not_found" });
    if (inbox.isActive(now)) return fail({ code: "not_expired" });

    const limit = await checkActiveLimit(this.deps, input.ownerId, now);
    if (limit) return fail(limit);

    const reactivated = inbox.reactivate(now, this.deps.policy, input.keep ?? false);
    await this.deps.repository.save(reactivated);
    return ok(toInboxView(reactivated, now, this.deps.mailDomain));
  }
}
