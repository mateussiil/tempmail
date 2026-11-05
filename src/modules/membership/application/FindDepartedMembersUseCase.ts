import type { Allowlist } from "../domain/Allowlist";
import type { MemberDirectory } from "./MemberDirectory";

export type DepartedMembers =
  | { status: "found"; memberIds: string[] }
  /**
   * A lista está vazia. Pelo login isso não autoriza ninguém, mas aqui não
   * vale como "todo mundo saiu": uma variável esquecida num deploy expiraria
   * as Caixas do time inteiro.
   */
  | { status: "skipped_empty_allowlist" };

/** Quem saiu do time: Membros cujo username não está mais na lista. */
export class FindDepartedMembersUseCase {
  constructor(private readonly deps: { members: MemberDirectory; allowlist: () => Allowlist }) {}

  async execute(): Promise<DepartedMembers> {
    const allowlist = this.deps.allowlist();
    if (allowlist.isEmpty) return { status: "skipped_empty_allowlist" };

    const members = await this.deps.members.listMembers();
    return {
      status: "found",
      memberIds: members.filter((member) => !allowlist.allows(member.githubUsername)).map((m) => m.id),
    };
  }
}
