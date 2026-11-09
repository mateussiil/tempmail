import { fail, ok, type Result } from "@/shared/result";
import { Inbox } from "../domain/Inbox";
import { parseInboxAddress } from "../domain/InboxAddress";
import type { MascotId } from "../domain/Mascot";
import { checkActiveLimit, type InboxDeps } from "./InboxDeps";
import type { InboxError } from "./InboxError";
import { InboxAddressConflictError } from "./InboxRepository";
import { toInboxView, type InboxView } from "./InboxView";

export type CreateInboxResult = Result<{ inbox: InboxView; reactivated: boolean }, InboxError>;

const MAX_RANDOM_ATTEMPTS = 5;

/**
 * Cria uma Caixa com endereço aleatório (sem `address`) ou escolhido. Se o
 * endereço escolhido já é do próprio Membro e está expirado, criar é reativar:
 * a Caixa volta vazia, com novo prazo.
 */
export class CreateInboxUseCase {
  constructor(private readonly deps: InboxDeps) {}

  /** Sem `mascot`, sorteia um (ao reativar, mantém o que a Caixa já tinha). */
  async execute(input: { ownerId: string; address?: string; mascot?: MascotId }): Promise<CreateInboxResult> {
    const now = this.deps.clock();

    if (input.address === undefined) {
      return this.createRandom(input.ownerId, input.mascot ?? this.deps.randomMascot(), now);
    }

    const parsed = parseInboxAddress(input.address);
    if (!parsed.ok) return fail({ code: "invalid_address", problem: parsed.problem });

    return this.createNamed(input.ownerId, parsed.value, input.mascot, now);
  }

  private async createNamed(
    ownerId: string,
    address: string,
    mascot: MascotId | undefined,
    now: Date,
  ): Promise<CreateInboxResult> {
    const existing = await this.deps.repository.findByAddress(address);
    if (existing) return this.reactivateIfYours(existing, ownerId, mascot, now);

    const limit = await checkActiveLimit(this.deps, ownerId, now);
    if (limit) return fail(limit);

    try {
      return ok(await this.open(ownerId, address, mascot ?? this.deps.randomMascot(), now));
    } catch (error) {
      if (!(error instanceof InboxAddressConflictError)) throw error;

      // Alguém criou o mesmo endereço entre a consulta e o insert: decide pelo vencedor.
      const winner = await this.deps.repository.findByAddress(address);
      return winner ? this.reactivateIfYours(winner, ownerId, mascot, now) : fail({ code: "address_taken" });
    }
  }

  private async createRandom(ownerId: string, mascot: MascotId, now: Date): Promise<CreateInboxResult> {
    const limit = await checkActiveLimit(this.deps, ownerId, now);
    if (limit) return fail(limit);

    for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
      const address = this.deps.randomAddress();
      if (await this.deps.repository.findByAddress(address)) continue;

      try {
        return ok(await this.open(ownerId, address, mascot, now));
      } catch (error) {
        if (!(error instanceof InboxAddressConflictError)) throw error;
      }
    }

    throw new Error("Não foi possível gerar um endereço aleatório livre");
  }

  private async open(ownerId: string, address: string, mascot: MascotId, now: Date) {
    const inbox = Inbox.open({
      id: this.deps.newId(),
      address,
      ownerId,
      now,
      policy: this.deps.policy,
      mascot,
    });
    await this.deps.repository.insert(inbox);
    return { inbox: toInboxView(inbox, now, this.deps.mailDomain), reactivated: false };
  }

  private async reactivateIfYours(
    existing: Inbox,
    ownerId: string,
    mascot: MascotId | undefined,
    now: Date,
  ): Promise<CreateInboxResult> {
    if (!existing.isOwnedBy(ownerId)) return fail({ code: "address_taken" });
    if (existing.isActive(now)) return fail({ code: "already_active" });

    const limit = await checkActiveLimit(this.deps, ownerId, now);
    if (limit) return fail(limit);

    // Reativar é recomeçar vazia, mesmo que a limpeza periódica ainda não tenha passado.
    await this.deps.contents.clear(existing.id);
    const back = existing.reactivate(now, this.deps.policy, false);
    const reactivated = mascot ? back.withMascot(mascot) : back;
    await this.deps.repository.save(reactivated);
    return ok({
      inbox: toInboxView(reactivated, now, this.deps.mailDomain),
      reactivated: true,
    });
  }
}
