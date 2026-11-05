import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/shared/db/client";
import type { MessageRepository } from "../application/ports";
import { Message } from "../domain/Message";
import { message as messages } from "./schema";

/** Canal do Postgres avisado a cada Mensagem nova; o payload é `{ inboxId, messageId }` em JSON. */
export const MESSAGE_CHANNEL = "inbox_message";

type Row = typeof messages.$inferSelect;

function toDomain(row: Row): Message {
  return Message.restore({
    id: row.id,
    inboxId: row.inboxId,
    emailId: row.emailId,
    messageId: row.messageId,
    fromAddress: row.fromAddress,
    fromHeader: row.fromHeader,
    subject: row.subject,
    textBody: row.textBody,
    htmlBody: row.htmlBody,
    verificationCode: row.verificationCode,
    status: row.status as Message["status"],
    rawKey: row.rawKey,
    rawSize: row.rawSize,
    attachments: row.attachments,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
  });
}

/** O Postgres recusa o byte nulo em texto, e um email de terceiros pode trazê-lo. */
function clean(text: string): string;
function clean(text: string | null): string | null;
function clean(text: string | null): string | null {
  return text === null ? null : text.replace(/\u0000/g, "");
}

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: Db) {}

  async insert(message: Message): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(messages)
        .values({
          id: message.id,
          inboxId: message.inboxId,
          emailId: message.emailId,
          messageId: clean(message.messageId),
          fromAddress: clean(message.fromAddress),
          fromHeader: clean(message.fromHeader),
          subject: clean(message.subject),
          textBody: clean(message.textBody),
          htmlBody: clean(message.htmlBody),
          verificationCode: message.verificationCode,
          status: message.status,
          rawKey: message.rawKey,
          rawSize: message.rawSize,
          attachments: message.attachments,
          receivedAt: message.receivedAt,
          createdAt: message.createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: messages.id });

      // Já existia (reenvio do webhook): ninguém precisa ser avisado.
      if (inserted.length === 0) return false;

      // O aviso só sai quando a transação confirma, então quem escuta sempre acha a linha.
      const payload = JSON.stringify({ inboxId: message.inboxId, messageId: message.id });
      await tx.execute(sql`select pg_notify(${MESSAGE_CHANNEL}, ${payload})`);
      return true;
    });
  }

  async existingIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(inArray(messages.id, ids));
    return new Set(rows.map((row) => row.id));
  }

  async listByInbox(inboxId: string, limit: number): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.inboxId, inboxId))
      .orderBy(desc(messages.receivedAt), desc(messages.createdAt))
      .limit(limit);
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Message | null> {
    const [row] = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }
}
