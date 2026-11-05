import type { InboxRepository } from "@/modules/inbox/application/InboxRepository";
import type { DirectoryInbox, InboxDirectory } from "@/modules/message/application/ports";

/**
 * Liga o módulo de Mensagens ao de Caixas: o que `message` precisa saber das
 * Caixas, respondido com o repositório de `inbox`. Mora na composição porque é
 * o único lugar que enxerga os dois módulos.
 */
export class InboxRepositoryDirectory implements InboxDirectory {
  constructor(
    private readonly inboxes: InboxRepository,
    private readonly clock: () => Date,
  ) {}

  async findByAddresses(addresses: string[]): Promise<DirectoryInbox[]> {
    const now = this.clock();
    const found = await Promise.all(addresses.map((address) => this.inboxes.findByAddress(address)));

    return found.flatMap((inbox) =>
      inbox ? [{ id: inbox.id, address: inbox.address, active: inbox.isActive(now) }] : [],
    );
  }

  async findOwned(ownerId: string, inboxId: string): Promise<DirectoryInbox | null> {
    const inbox = await this.inboxes.findById(inboxId);
    if (!inbox || !inbox.isOwnedBy(ownerId)) return null;
    return { id: inbox.id, address: inbox.address, active: inbox.isActive(this.clock()) };
  }
}
