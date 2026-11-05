/** Credencial nomeada de um Membro para a API e o MCP (ver `CONTEXT.md`). Nunca guarda o segredo. */
export class ApiKey {
  constructor(
    readonly id: string,
    readonly memberId: string,
    readonly name: string,
    /** Começo do segredo (`tm_` + 8 caracteres), só para reconhecer a chave na lista. */
    readonly prefix: string,
    readonly createdAt: Date,
    readonly lastUsedAt: Date | null,
    readonly revokedAt: Date | null,
  ) {}

  get isActive(): boolean {
    return this.revokedAt === null;
  }
}
