import type { Allowlist } from "../domain/Allowlist";
import { Member } from "../domain/Member";
import type { SessionReader } from "./SessionReader";

export type CurrentMember =
  | { status: "anonymous" }
  /** Tem sessão, mas o username saiu da lista (ou nunca esteve). */
  | { status: "revoked"; githubUsername: string | null }
  | { status: "member"; member: Member };

/**
 * Roda em todo pedido autenticado: a lista é lida de novo a cada chamada, então
 * tirar um username dela corta o acesso no pedido seguinte, mesmo com sessão
 * válida.
 */
export class GetCurrentMemberUseCase {
  constructor(
    private readonly sessions: SessionReader,
    private readonly allowlist: () => Allowlist,
  ) {}

  async execute(): Promise<CurrentMember> {
    const user = await this.sessions.readSessionUser();
    if (!user) return { status: "anonymous" };

    if (!user.githubUsername || !this.allowlist().allows(user.githubUsername)) {
      return { status: "revoked", githubUsername: user.githubUsername };
    }

    return {
      status: "member",
      member: new Member(user.id, user.githubUsername, user.name, user.image),
    };
  }
}
