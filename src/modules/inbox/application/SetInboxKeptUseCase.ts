import { fail, ok, type Result } from "@/shared/result";
import { findOwnedInbox, type InboxDeps } from "./InboxDeps";
import type { InboxError } from "./InboxError";
import { toInboxView, type InboxView } from "./InboxView";

/** Manter (tira o prazo) ou deixar de manter (volta a ter prazo). Só Caixa ativa. */
export class SetInboxKeptUseCase {
  constructor(private readonly deps: InboxDeps) {}

  async execute(input: {
    ownerId: string;
    inboxId: string;
    kept: boolean;
  }): Promise<Result<InboxView, InboxError>> {
    const now = this.deps.clock();

    const inbox = await findOwnedInbox(this.deps, input.ownerId, input.inboxId);
    if (!inbox) return fail({ code: "not_found" });
    if (!inbox.isActive(now)) return fail({ code: "not_active" });

    // Já está como pedido: nada a gravar (e deixar de manter não renova o prazo à toa).
    if (inbox.isKept(now) === input.kept) {
      return ok(toInboxView(inbox, now, this.deps.mailDomain));
    }

    const updated = input.kept ? inbox.keep(now) : inbox.release(now, this.deps.policy);
    await this.deps.repository.save(updated);
    return ok(toInboxView(updated, now, this.deps.mailDomain));
  }
}
