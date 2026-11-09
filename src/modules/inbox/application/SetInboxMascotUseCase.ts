import { fail, ok, type Result } from "@/shared/result";
import type { MascotId } from "../domain/Mascot";
import { findOwnedInbox, type InboxDeps } from "./InboxDeps";
import type { InboxError } from "./InboxError";
import { toInboxView, type InboxView } from "./InboxView";

/** Troca o mascote de uma Caixa do Membro, em qualquer estado. */
export class SetInboxMascotUseCase {
  constructor(private readonly deps: InboxDeps) {}

  async execute(input: { ownerId: string; inboxId: string; mascot: MascotId }): Promise<Result<InboxView, InboxError>> {
    const now = this.deps.clock();

    const inbox = await findOwnedInbox(this.deps, input.ownerId, input.inboxId);
    if (!inbox) return fail({ code: "not_found" });

    if (inbox.mascotChoice !== input.mascot) {
      const updated = inbox.withMascot(input.mascot);
      await this.deps.repository.save(updated);
      return ok(toInboxView(updated, now, this.deps.mailDomain));
    }
    return ok(toInboxView(inbox, now, this.deps.mailDomain));
  }
}
