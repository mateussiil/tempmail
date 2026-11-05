"use client";

import { useState } from "react";
import { CopyButton } from "@/shared/ui/CopyButton";
import { CopyIcon } from "@/shared/ui/icons";
import { deadlineLong } from "@/shared/ui/format";
import type { InboxView } from "../application/InboxView";

type InboxHeaderProps = {
  inbox: InboxView;
  now: Date;
  /** `true` enquanto um pedido desta Caixa está em andamento. */
  busy: boolean;
  /** A última atualização falhou (sem conexão, por exemplo). */
  offline: boolean;
  onToggleKept: (kept: boolean) => void;
  onDelete: () => void;
  /** Só aparece no celular: volta para a lista de Caixas. */
  onBack: () => void;
};

/** O topo da coluna de Mensagens: endereço, prazo, Manter, Apagar e o aviso de atualização. */
export function InboxHeader({ inbox, now, busy, offline, onToggleKept, onDelete, onBack }: InboxHeaderProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="inbox-header">
      <button type="button" className="back-link" onClick={onBack}>
        ‹ Caixas
      </button>
      <div className="row">
        <span className="mono address">{inbox.fullAddress}</span>
        <CopyButton text={inbox.fullAddress} ariaLabel="Copiar endereço" className="icon-button">
          <CopyIcon />
        </CopyButton>
      </div>
      <div className="row wrap muted small">
        <span>{deadlineLong(inbox, now)}</span>
        <span aria-hidden="true">·</span>
        <label className="check">
          <input
            type="checkbox"
            checked={inbox.kept}
            disabled={busy}
            onChange={(e) => onToggleKept(e.target.checked)}
          />
          Manter
        </label>
        <span aria-hidden="true">·</span>
        {confirming ? (
          <span className="row wrap" role="group" aria-label="Confirmar apagar">
            <span>Apagar a caixa e as mensagens?</span>
            <button
              type="button"
              className="link-button danger"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
            >
              Sim, apagar
            </button>
            <button type="button" className="link-button" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </span>
        ) : (
          <button type="button" className="link-button danger" disabled={busy} onClick={() => setConfirming(true)}>
            Apagar
          </button>
        )}
      </div>
      <div className={`live small${offline ? " is-offline" : ""}`}>
        <span className="dot" aria-hidden="true" />
        {offline ? "Sem conexão. Tentando de novo…" : "Atualizando a cada 5 s"}
      </div>
    </div>
  );
}
