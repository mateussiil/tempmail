/** Regras de tamanho e prazo das Caixas; os valores vêm da configuração. */
export class InboxPolicy {
  constructor(
    readonly maxActivePerMember: number,
    readonly ttlHours: number,
  ) {
    if (!Number.isInteger(maxActivePerMember) || maxActivePerMember <= 0) {
      throw new Error("maxActivePerMember precisa ser um inteiro positivo");
    }
    if (!Number.isInteger(ttlHours) || ttlHours <= 0) {
      throw new Error("ttlHours precisa ser um inteiro positivo");
    }
  }

  /** Quando uma Caixa aberta ou reativada agora expira. */
  expiryFrom(now: Date): Date {
    return new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000);
  }
}
