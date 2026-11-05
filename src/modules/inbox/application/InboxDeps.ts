import type { Inbox } from "../domain/Inbox";
import type { InboxPolicy } from "../domain/InboxPolicy";
import type { InboxError } from "./InboxError";
import type { InboxRepository } from "./InboxRepository";

/** Tudo de que os casos de uso de Caixa dependem, injetado na composição. */
export type InboxDeps = {
  repository: InboxRepository;
  policy: InboxPolicy;
  /** Domínio do email, ex.: `tmp.mateussiil.com.br`. */
  mailDomain: string;
  clock: () => Date;
  newId: () => string;
  /** Gera um endereço aleatório (só a parte antes do `@`). */
  randomAddress: () => string;
};

/** `null` se o Membro ainda pode ter mais uma Caixa ativa; senão o erro. */
export async function checkActiveLimit(
  deps: InboxDeps,
  ownerId: string,
  now: Date,
): Promise<InboxError | null> {
  const active = await deps.repository.countActiveByOwner(ownerId, now);
  const max = deps.policy.maxActivePerMember;
  return active >= max ? { code: "limit_reached", max } : null;
}

/** A Caixa só existe para quem a consulta se for dela. */
export async function findOwnedInbox(
  deps: InboxDeps,
  ownerId: string,
  inboxId: string,
): Promise<Inbox | null> {
  const inbox = await deps.repository.findById(inboxId);
  return inbox && inbox.isOwnedBy(ownerId) ? inbox : null;
}
