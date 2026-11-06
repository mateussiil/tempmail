import type { Allowlist } from "../domain/Allowlist";
import { Member } from "../domain/Member";
import type { MemberDirectory } from "./MemberDirectory";
import type { RateLimiter } from "./RateLimiter";

export type OAuthTokenAuthentication =
  /** O token é de um usuário que não existe mais. */
  | { status: "invalid" }
  /** O Membro saiu da lista: o token deixa de valer na hora, como a Chave de API. */
  | { status: "revoked" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "member"; member: Member };

/**
 * Roda em todo pedido ao MCP com token OAuth, depois que a assinatura, o
 * emissor, o recurso e o escopo já foram conferidos. O Better Auth não conhece
 * a lista de autorizados (o app confere a cada pedido), então um token emitido
 * antes de o Membro sair da lista é recusado aqui. O limite é o mesmo da Chave
 * de API, contado por Membro e cliente.
 */
export class AuthenticateOAuthTokenUseCase {
  constructor(
    private readonly deps: {
      members: MemberDirectory;
      allowlist: () => Allowlist;
      limiter: RateLimiter;
      clock: () => Date;
    },
  ) {}

  async execute(input: { userId: string; clientId: string }): Promise<OAuthTokenAuthentication> {
    const found = await this.deps.members.findById(input.userId);
    if (!found) return { status: "invalid" };
    if (!found.githubUsername || !this.deps.allowlist().allows(found.githubUsername)) return { status: "revoked" };

    const decision = this.deps.limiter.hit(`oauth:${input.clientId}:${input.userId}`, this.deps.clock());
    if (!decision.allowed) return { status: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };

    return { status: "member", member: new Member(found.id, found.githubUsername, found.name, found.image) };
  }
}
