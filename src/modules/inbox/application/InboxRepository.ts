import type { Inbox } from "../domain/Inbox";

/** O endereço já existe (o índice único do banco recusou o insert). */
export class InboxAddressConflictError extends Error {
  constructor(readonly address: string) {
    super(`Já existe uma Caixa com o endereço ${address}`);
    this.name = "InboxAddressConflictError";
  }
}

export interface InboxRepository {
  findById(id: string): Promise<Inbox | null>;
  /** O endereço já normalizado (minúsculas). Vale em qualquer estado da Caixa. */
  findByAddress(address: string): Promise<Inbox | null>;
  listByOwner(ownerId: string): Promise<Inbox[]>;
  /** Quantas Caixas ativas o Membro tem, contando as mantidas. */
  countActiveByOwner(ownerId: string, now: Date): Promise<number>;
  /** Lança `InboxAddressConflictError` se o endereço já existe. */
  insert(inbox: Inbox): Promise<void>;
  save(inbox: Inbox): Promise<void>;
}
