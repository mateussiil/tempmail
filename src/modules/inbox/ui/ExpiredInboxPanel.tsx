"use client";

import { useState } from "react";
import { timeAgo } from "@/shared/ui/format";
import type { InboxView } from "../application/InboxView";

type ExpiredInboxPanelProps = {
  inbox: InboxView;
  now: Date;
  ttlHours: number;
  busy: boolean;
  error: string | null;
  onReactivate: (keep: boolean) => void;
  onBack: () => void;
};

/** Caixa expirada: explica o que aconteceu e oferece Reativar (com a opção de já manter). */
export function ExpiredInboxPanel({ inbox, now, ttlHours, busy, error, onReactivate, onBack }: ExpiredInboxPanelProps) {
  const [keep, setKeep] = useState(false);

  return (
    <div className="expired-panel">
      <div className="inbox-header">
        <button type="button" className="back-link" onClick={onBack}>
          ‹ Caixas
        </button>
        <span className="mono address">{inbox.fullAddress}</span>
      </div>
      <div className="notice notice-warn">
        <strong>{inbox.expiresAt ? `Expirou ${timeAgo(inbox.expiresAt, now)}` : "Expirada"}</strong>
        <p>As mensagens foram apagadas. O endereço continua seu: ninguém mais do time pode usá-lo.</p>
        {error ? (
          <p role="alert" className="alert alert-bad">
            {error}
          </p>
        ) : null}
        <button type="button" className="button" disabled={busy} onClick={() => onReactivate(keep)}>
          {keep ? "Reativar e manter" : `Reativar por ${ttlHours} h`}
        </button>
        <label className="check">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          Manter depois de reativar
        </label>
      </div>
    </div>
  );
}
