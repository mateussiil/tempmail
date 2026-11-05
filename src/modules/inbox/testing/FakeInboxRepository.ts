import type { Inbox } from "../domain/Inbox";
import { InboxAddressConflictError, type InboxRepository } from "../application/InboxRepository";

/** Em memória, com a mesma regra do banco: endereço único. */
export class FakeInboxRepository implements InboxRepository {
  private readonly byId = new Map<string, Inbox>();

  async findById(id: string): Promise<Inbox | null> {
    return this.byId.get(id) ?? null;
  }

  async findByAddress(address: string): Promise<Inbox | null> {
    return [...this.byId.values()].find((inbox) => inbox.address === address) ?? null;
  }

  async listByOwner(ownerId: string): Promise<Inbox[]> {
    return [...this.byId.values()].filter((inbox) => inbox.ownerId === ownerId);
  }

  async countActiveByOwner(ownerId: string, now: Date): Promise<number> {
    return (await this.listByOwner(ownerId)).filter((inbox) => inbox.isActive(now)).length;
  }

  async insert(inbox: Inbox): Promise<void> {
    if (await this.findByAddress(inbox.address)) {
      throw new InboxAddressConflictError(inbox.address);
    }
    this.byId.set(inbox.id, inbox);
  }

  async save(inbox: Inbox): Promise<void> {
    this.byId.set(inbox.id, inbox);
  }

  /** Para os testes simularem uma corrida: o endereço aparece entre a consulta e o insert. */
  seed(inbox: Inbox): void {
    this.byId.set(inbox.id, inbox);
  }
}
