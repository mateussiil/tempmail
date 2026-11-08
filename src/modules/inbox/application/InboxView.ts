import type { Inbox } from "../domain/Inbox";
import type { MascotId } from "../domain/Mascot";

/** O que sai dos casos de uso: dados simples, prontos para JSON. */
export type InboxView = {
  id: string;
  /** Só a parte antes do `@`. */
  address: string;
  /** O endereço completo, com o domínio. */
  fullAddress: string;
  status: "active" | "expired";
  /** Mantida: ativa e sem prazo. */
  kept: boolean;
  /** `null` quando mantida. */
  expiresAt: string | null;
  createdAt: string;
  /** O mensageiro da Caixa (ver `Mascot.ts`). */
  mascot: MascotId;
};

export function toInboxView(inbox: Inbox, now: Date, mailDomain: string): InboxView {
  return {
    id: inbox.id,
    address: inbox.address,
    fullAddress: `${inbox.address}@${mailDomain}`,
    status: inbox.isActive(now) ? "active" : "expired",
    kept: inbox.isKept(now),
    expiresAt: inbox.expiresAt ? inbox.expiresAt.toISOString() : null,
    createdAt: inbox.createdAt.toISOString(),
    mascot: inbox.mascot,
  };
}
