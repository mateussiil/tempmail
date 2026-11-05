import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "../../../shared/db/auth-schema";

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // `tm_` + 8 caracteres do segredo, só para reconhecer a chave na lista.
    prefix: text("prefix").notNull(),
    // SHA-256 do segredo. O segredo em si nunca é gravado.
    keyHash: text("key_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("api_key_member_idx").on(table.memberId)],
);
