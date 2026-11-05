import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { inbox } from "../../inbox/infrastructure/schema";
import type { AttachmentMeta } from "../domain/Message";

export const message = pgTable(
  "message",
  {
    // Derivado do email e da Caixa (ver Message.idFor): reenviar não duplica.
    id: text("id").primaryKey(),
    inboxId: text("inbox_id")
      .notNull()
      .references(() => inbox.id, { onDelete: "cascade" }),
    // Id do email no Resend.
    emailId: text("email_id").notNull(),
    // Cabeçalho Message-ID (RFC).
    messageId: text("message_id"),
    fromAddress: text("from_address").notNull(),
    fromHeader: text("from_header"),
    subject: text("subject").notNull(),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    verificationCode: text("verification_code"),
    status: text("status").notNull(),
    // Chave do .eml no R2; nula quando não foi guardado.
    rawKey: text("raw_key"),
    rawSize: integer("raw_size"),
    attachments: jsonb("attachments").$type<AttachmentMeta[]>().notNull().default([]),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("message_email_inbox_unique").on(table.emailId, table.inboxId),
    index("message_inbox_received_idx").on(table.inboxId, table.receivedAt),
    check("message_status_check", sql`${table.status} in ('ready', 'quota_exceeded', 'too_large')`),
  ],
);
