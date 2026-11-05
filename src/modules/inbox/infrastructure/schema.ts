import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "../../../shared/db/auth-schema";

export const inbox = pgTable(
  "inbox",
  {
    id: text("id").primaryKey(),
    // Parte local do endereço, sempre em minúsculas. Única pra sempre: o
    // endereço pertence ao primeiro Dono, mesmo depois de expirar.
    address: text("address").notNull().unique(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // Nulo = mantida (sem prazo). No passado = expirada.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("inbox_owner_idx").on(table.ownerId)],
);
