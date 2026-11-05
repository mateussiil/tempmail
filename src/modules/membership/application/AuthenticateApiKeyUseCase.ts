import type { Allowlist } from "../domain/Allowlist";
import { looksLikeApiKey, hashApiKeyToken } from "../domain/apiKeyToken";
import { Member } from "../domain/Member";
import type { ApiKeyRepository } from "./ApiKeyRepository";
import type { RateLimiter } from "./RateLimiter";

export type ApiKeyAuthentication =
  /** Chave desconhecida, mal formada ou revogada. */
  | { status: "invalid" }
  /** A chave é boa, mas o dono saiu da lista. */
  | { status: "revoked" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "member"; member: Member };

/** Só grava o último uso se o anterior passou disso, pra não escrever no banco a cada pedido. */
const LAST_USED_GRANULARITY_MS = 60_000;

/**
 * Roda em todo pedido com chave: confere a lista de autorizados de novo (tirar
 * o Membro corta as chaves dele no pedido seguinte) e aplica o limite por chave.
 */
export class AuthenticateApiKeyUseCase {
  constructor(
    private readonly deps: {
      repository: ApiKeyRepository;
      allowlist: () => Allowlist;
      limiter: RateLimiter;
      clock: () => Date;
    },
  ) {}

  async execute(token: string): Promise<ApiKeyAuthentication> {
    if (!looksLikeApiKey(token)) return { status: "invalid" };

    const found = await this.deps.repository.findByHash(hashApiKeyToken(token));
    if (!found || !found.key.isActive) return { status: "invalid" };

    const { key, owner } = found;
    if (!owner.githubUsername || !this.deps.allowlist().allows(owner.githubUsername)) {
      return { status: "revoked" };
    }

    const now = this.deps.clock();
    const decision = this.deps.limiter.hit(key.id, now);
    if (!decision.allowed) return { status: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };

    if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() >= LAST_USED_GRANULARITY_MS) {
      await this.deps.repository.touchLastUsed(key.id, now);
    }

    return { status: "member", member: new Member(owner.id, owner.githubUsername, owner.name, owner.image) };
  }
}
