import type { InboxDeps } from "./InboxDeps";
import { toInboxView, type InboxView } from "./InboxView";

/** As Caixas do Membro: ativas primeiro, depois as expiradas; as mais novas antes. */
export class ListInboxesUseCase {
  constructor(private readonly deps: InboxDeps) {}

  async execute(input: { ownerId: string }): Promise<InboxView[]> {
    const now = this.deps.clock();
    const inboxes = await this.deps.repository.listByOwner(input.ownerId);

    return inboxes
      .map((inbox) => toInboxView(inbox, now, this.deps.mailDomain))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }
}
