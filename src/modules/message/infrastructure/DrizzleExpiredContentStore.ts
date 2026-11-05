import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@/shared/db/client";
import { inbox } from "../../inbox/infrastructure/schema";
import type { ExpiredContentStore } from "../application/ports";
import { message } from "./schema";

/**
 * O conteúdo das Caixas expiradas no Postgres. A purga trava a linha da Caixa
 * (`FOR UPDATE`): uma reativação ao mesmo tempo espera a purga terminar e a
 * Caixa volta vazia, e uma purga que chega depois da reativação não apaga nada.
 */
export class DrizzleExpiredContentStore implements ExpiredContentStore {
  constructor(private readonly db: Db) {}

  async inboxesWithContent(now: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ id: message.inboxId })
      .from(message)
      .innerJoin(inbox, eq(inbox.id, message.inboxId))
      .where(and(isNotNull(inbox.expiresAt), lte(inbox.expiresAt, now)))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async purge(inboxId: string, now: Date, removeFiles: () => Promise<void>): Promise<number | null> {
    return this.db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: inbox.id })
        .from(inbox)
        .where(and(eq(inbox.id, inboxId), isNotNull(inbox.expiresAt), lte(inbox.expiresAt, now)))
        .for("update");
      if (locked.length === 0) return null;

      const deleted = await tx.delete(message).where(eq(message.inboxId, inboxId)).returning({ id: message.id });
      // Se os arquivos falham, a transação desfaz e a Caixa fica para a próxima execução.
      await removeFiles();
      return deleted.length;
    });
  }
}

