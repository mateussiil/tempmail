"use client";

import { useState } from "react";

type ExpiredInboxPanelProps = {
  ttlHours: number;
  busy: boolean;
  error: string | null;
  onReactivate: (keep: boolean) => void;
};

/** Caixa expirada: explica o que aconteceu e oferece Reativar (com a opção de já manter). */
export function ExpiredInboxPanel({ ttlHours, busy, error, onReactivate }: ExpiredInboxPanelProps) {
  const [keep, setKeep] = useState(false);

  return (
    <div className="notice notice-warn expired-notice">
      <strong>Esta caixa expirou</strong>
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
  );
}
