import { and, eq } from "drizzle-orm";
import type { Db } from "@/shared/db/client";
import { user } from "@/shared/db/auth-schema";
import type { ApiKeyRepository } from "../application/ApiKeyRepository";
import { ApiKey } from "../domain/ApiKey";
import { apiKey } from "./schema";

function toDomain(row: typeof apiKey.$inferSelect): ApiKey {
  return new ApiKey(row.id, row.memberId, row.name, row.prefix, row.createdAt, row.lastUsedAt, row.revokedAt);
}

export class DrizzleApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: Db) {}

  async insert(key: ApiKey, keyHash: string): Promise<void> {
    await this.db.insert(apiKey).values({
      id: key.id,
      memberId: key.memberId,
      name: key.name,
      prefix: key.prefix,
      keyHash,
      createdAt: key.createdAt,
    });
  }

  async findByHash(keyHash: string) {
    const [row] = await this.db
      .select({ key: apiKey, owner: user })
      .from(apiKey)
      .innerJoin(user, eq(user.id, apiKey.memberId))
      .where(eq(apiKey.keyHash, keyHash))
      .limit(1);
    if (!row) return null;

    return {
      key: toDomain(row.key),
      owner: {
        id: row.owner.id,
        githubUsername: row.owner.githubUsername,
        name: row.owner.name,
        image: row.owner.image,
      },
    };
  }

  async listByMember(memberId: string): Promise<ApiKey[]> {
    const rows = await this.db.select().from(apiKey).where(eq(apiKey.memberId, memberId));
    return rows.map(toDomain);
  }

  async revoke(id: string, memberId: string, at: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(and(eq(apiKey.id, id), eq(apiKey.memberId, memberId)))
      .limit(1);
    if (!row) return false;
    if (row.revokedAt) return true;

    await this.db.update(apiKey).set({ revokedAt: at }).where(eq(apiKey.id, id));
    return true;
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.db.update(apiKey).set({ lastUsedAt: at }).where(eq(apiKey.id, id));
  }
}
