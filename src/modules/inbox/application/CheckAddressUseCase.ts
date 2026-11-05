import { parseInboxAddress, type AddressProblem } from "../domain/InboxAddress";
import type { InboxDeps } from "./InboxDeps";

export type AddressAvailability =
  | { availability: "invalid"; problem: AddressProblem }
  /** Ninguém usou: dá pra criar. */
  | { availability: "free" }
  /** É do próprio Membro, expirada: criar vai reativar, vazia. */
  | { availability: "yours_expired" }
  /** É do próprio Membro e já está ativa. */
  | { availability: "yours_active" }
  /** Pertence a outro Membro. */
  | { availability: "taken" };

/** Para o campo de nome da tela de nova Caixa: diz o que aconteceria ao criar. */
export class CheckAddressUseCase {
  constructor(private readonly deps: InboxDeps) {}

  async execute(input: { ownerId: string; address: string }): Promise<AddressAvailability> {
    const parsed = parseInboxAddress(input.address);
    if (!parsed.ok) return { availability: "invalid", problem: parsed.problem };

    const existing = await this.deps.repository.findByAddress(parsed.value);
    if (!existing) return { availability: "free" };
    if (!existing.isOwnedBy(input.ownerId)) return { availability: "taken" };

    return existing.isActive(this.deps.clock())
      ? { availability: "yours_active" }
      : { availability: "yours_expired" };
  }
}
