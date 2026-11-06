function normalize(username: string): string {
  return username.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Lista de usernames do GitHub autorizados a usar o tempmail. Falha fechada:
 * lista vazia ou ausente não autoriza ninguém.
 */
export class Allowlist {
  private constructor(private readonly usernames: ReadonlySet<string>) {}

  /** Aceita o formato da variável de ambiente: "ana, @Bruno,carla". */
  static fromString(raw: string | undefined): Allowlist {
    const names = (raw ?? "")
      .split(",")
      .map(normalize)
      .filter((name) => name.length > 0);
    return new Allowlist(new Set(names));
  }

  /** Lista vazia: ninguém entra (e ninguém deve ser tratado como "saiu do time" por engano). */
  get isEmpty(): boolean {
    return this.usernames.size === 0;
  }

  allows(username: string | null | undefined): boolean {
    if (!username) return false;
    return this.usernames.has(normalize(username));
  }
}
