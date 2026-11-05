import type { InboxDeps } from "../application/InboxDeps";
import { InboxPolicy } from "../domain/InboxPolicy";
import { FakeInboxRepository } from "./FakeInboxRepository";

/** Dependências de teste: relógio que anda sob controle, ids e endereços previsíveis. */
export function makeInboxDeps(options: { max?: number; repository?: FakeInboxRepository } = {}) {
  const repository = options.repository ?? new FakeInboxRepository();
  let now = new Date("2026-11-05T12:00:00Z");
  let ids = 0;
  let randoms = 0;

  const deps: InboxDeps = {
    repository,
    policy: new InboxPolicy(options.max ?? 20, 24),
    mailDomain: "tmp.exemplo.test",
    clock: () => now,
    newId: () => `id-${++ids}`,
    randomAddress: () => `aleatoria${++randoms}`,
  };

  return {
    deps,
    repository,
    now: () => now,
    advanceHours(hours: number) {
      now = new Date(now.getTime() + hours * 3_600_000);
    },
  };
}
