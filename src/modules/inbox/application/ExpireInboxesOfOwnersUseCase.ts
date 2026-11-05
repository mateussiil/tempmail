import type { InboxDeps } from "./InboxDeps";

/**
 * Saída do time: expira agora todas as Caixas ativas destes Membros, inclusive
 * as mantidas. Os endereços continuam deles. Repetir não faz mal.
 */
export class ExpireInboxesOfOwnersUseCase {
  constructor(private readonly deps: Pick<InboxDeps, "repository" | "clock">) {}

  async execute(input: { ownerIds: string[] }): Promise<{ expiredInboxes: number }> {
    const now = this.deps.clock();
    let expiredInboxes = 0;

    for (const ownerId of input.ownerIds) {
      for (const inbox of await this.deps.repository.listByOwner(ownerId)) {
        if (!inbox.isActive(now)) continue;
        await this.deps.repository.save(inbox.expire(now));
        expiredInboxes++;
      }
    }

    return { expiredInboxes };
  }
}
