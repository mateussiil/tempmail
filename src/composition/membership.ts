import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GetCurrentMemberUseCase } from "@/modules/membership/application/GetCurrentMemberUseCase";
import { Allowlist } from "@/modules/membership/domain/Allowlist";
import type { Member } from "@/modules/membership/domain/Member";
import { getAuth } from "@/modules/membership/infrastructure/auth";
import { BetterAuthSessionReader } from "@/modules/membership/infrastructure/BetterAuthSessionReader";

export function composeGetCurrentMember(): GetCurrentMemberUseCase {
  return new GetCurrentMemberUseCase(
    new BetterAuthSessionReader(getAuth, () => headers()),
    // Lida de novo a cada pedido: tirar um username da lista corta o acesso.
    () => Allowlist.fromString(process.env.ALLOWED_GITHUB_USERS),
  );
}

/** Para páginas que exigem Membro: manda quem não é para a tela certa. */
export async function requireMember(): Promise<Member> {
  const current = await composeGetCurrentMember().execute();

  if (current.status === "anonymous") redirect("/entrar");
  if (current.status === "revoked") redirect("/acesso-encerrado");
  return current.member;
}
