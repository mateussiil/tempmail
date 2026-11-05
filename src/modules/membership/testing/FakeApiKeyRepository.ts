import type { ApiKeyRepository } from "../application/ApiKeyRepository";
import type { SessionUser } from "../application/SessionReader";
import { ApiKey } from "../domain/ApiKey";

export class FakeApiKeyRepository implements ApiKeyRepository {
  readonly keys = new Map<string, { key: ApiKey; hash: string }>();
  readonly owners = new Map<string, SessionUser>();
  touches = 0;

  async insert(key: ApiKey, keyHash: string) {
    this.keys.set(key.id, { key, hash: keyHash });
  }

  async findByHash(keyHash: string) {
    for (const { key, hash } of this.keys.values()) {
      const owner = this.owners.get(key.memberId);
      if (hash === keyHash && owner) return { key, owner };
    }
    return null;
  }

  async listByMember(memberId: string) {
    return [...this.keys.values()].map((entry) => entry.key).filter((key) => key.memberId === memberId);
  }

  async revoke(id: string, memberId: string, at: Date) {
    const entry = this.keys.get(id);
    if (!entry || entry.key.memberId !== memberId) return false;
    if (entry.key.isActive) this.replace(entry, { revokedAt: at });
    return true;
  }

  async touchLastUsed(id: string, at: Date) {
    const entry = this.keys.get(id);
    if (entry) this.replace(entry, { lastUsedAt: at });
    this.touches += 1;
  }

  private replace(
    entry: { key: ApiKey; hash: string },
    change: { lastUsedAt?: Date; revokedAt?: Date },
  ) {
    const { key } = entry;
    this.keys.set(key.id, {
      hash: entry.hash,
      key: new ApiKey(
        key.id,
        key.memberId,
        key.name,
        key.prefix,
        key.createdAt,
        change.lastUsedAt ?? key.lastUsedAt,
        change.revokedAt ?? key.revokedAt,
      ),
    });
  }
}
