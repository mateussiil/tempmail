import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/shared/db/client";
import { Inbox } from "../domain/Inbox";
import { InboxAddressConflictError, type InboxRepository } from "../application/InboxRepository";
import { inbox } from "./schema";

type Row = typeof inbox.$inferSelect;

function toDomain(row: Row): Inbox {
  return new Inbox(row.id, row.address, row.ownerId, row.expiresAt, row.createdAt);
}

/** O Drizzle embrulha o erro do `pg`; o código e o nome da constraint ficam em `cause`. */
function isAddressConflict(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some((candidate) => {
    const pg = candidate as { code?: string; constraint?: string } | null;
    return pg?.code === "23505" && (pg.constraint ?? "").includes("address");
  });
}

export class DrizzleInboxRepository implements InboxRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Inbox | null> {
    const [row] = await this.db.select().from(inbox).where(eq(inbox.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByAddress(address: string): Promise<Inbox | null> {
    const [row] = await this.db.select().from(inbox).where(eq(inbox.address, address)).limit(1);
    return row ? toDomain(row) : null;
  }

  async listByOwner(ownerId: string): Promise<Inbox[]> {
    const rows = await this.db.select().from(inbox).where(eq(inbox.ownerId, ownerId));
    return rows.map(toDomain);
  }

  async countActiveByOwner(ownerId: string, now: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inbox)
      .where(
        and(eq(inbox.ownerId, ownerId), or(isNull(inbox.expiresAt), gt(inbox.expiresAt, now))),
      );
    return row?.count ?? 0;
  }

  async insert(entity: Inbox): Promise<void> {
    try {
      await this.db.insert(inbox).values({
        id: entity.id,
        address: entity.address,
        ownerId: entity.ownerId,
        expiresAt: entity.expiresAt,
        createdAt: entity.createdAt,
      });
    } catch (error) {
      if (isAddressConflict(error)) throw new InboxAddressConflictError(entity.address);
      throw error;
    }
  }

  async save(entity: Inbox): Promise<void> {
    await this.db
      .update(inbox)
      .set({ expiresAt: entity.expiresAt, updatedAt: new Date() })
      .where(eq(inbox.id, entity.id));
  }
}
