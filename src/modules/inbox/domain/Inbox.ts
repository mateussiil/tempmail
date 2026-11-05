import type { InboxPolicy } from "./InboxPolicy";

export class InboxStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboxStateError";
  }
}

/**
 * Caixa (ver `CONTEXT.md`). O endereço pertence ao primeiro Dono pra sempre.
 *
 * Estado, a partir de `expiresAt`:
 * - `null`: ativa e **mantida** (sem prazo);
 * - no futuro: ativa;
 * - no passado: expirada. "Apagar" é expirar agora.
 *
 * As transições devolvem uma Caixa nova; quem chama confere o estado antes
 * (os casos de uso devolvem erros de negócio), e uma transição inválida aqui
 * é erro de programação e lança.
 */
export class Inbox {
  constructor(
    readonly id: string,
    readonly address: string,
    readonly ownerId: string,
    readonly expiresAt: Date | null,
    readonly createdAt: Date,
  ) {}

  static open(args: {
    id: string;
    address: string;
    ownerId: string;
    now: Date;
    policy: InboxPolicy;
  }): Inbox {
    const { id, address, ownerId, now, policy } = args;
    return new Inbox(id, address, ownerId, policy.expiryFrom(now), now);
  }

  isOwnedBy(memberId: string): boolean {
    return this.ownerId === memberId;
  }

  isActive(now: Date): boolean {
    return this.expiresAt === null || this.expiresAt.getTime() > now.getTime();
  }

  isKept(now: Date): boolean {
    return this.expiresAt === null && this.isActive(now);
  }

  /** Manter: tira o prazo. Só vale para Caixa ativa. */
  keep(now: Date): Inbox {
    this.assertActive(now, "manter");
    return this.withExpiry(null);
  }

  /** Deixa de manter: volta a ter prazo, contado a partir de agora. */
  release(now: Date, policy: InboxPolicy): Inbox {
    this.assertActive(now, "deixar de manter");
    return this.withExpiry(policy.expiryFrom(now));
  }

  /** Apagar equivale a expirar agora. Já expirada: continua como está. */
  expire(now: Date): Inbox {
    if (!this.isActive(now)) return this;
    return this.withExpiry(now);
  }

  /** Reativar: a Caixa expirada volta, com novo prazo (ou mantida). */
  reactivate(now: Date, policy: InboxPolicy, keep: boolean): Inbox {
    if (this.isActive(now)) {
      throw new InboxStateError("Só uma Caixa expirada pode ser reativada");
    }
    return this.withExpiry(keep ? null : policy.expiryFrom(now));
  }

  private assertActive(now: Date, action: string): void {
    if (!this.isActive(now)) {
      throw new InboxStateError(`Só uma Caixa ativa pode ${action}`);
    }
  }

  private withExpiry(expiresAt: Date | null): Inbox {
    return new Inbox(this.id, this.address, this.ownerId, expiresAt, this.createdAt);
  }
}
