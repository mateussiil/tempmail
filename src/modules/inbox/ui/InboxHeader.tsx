"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/shared/ui/CopyButton";
import { deadlineLong } from "@/shared/ui/format";
import { CopyIcon } from "@/shared/ui/icons";
import type { InboxView } from "../application/InboxView";
import { mascotById } from "../domain/Mascot";
import { MascotAvatar } from "./MascotAvatar";

type InboxHeaderProps = {
  inbox: InboxView;
  now: Date;
  /** `true` enquanto um pedido desta Caixa está em andamento. */
  busy: boolean;
  /** A última atualização falhou (sem conexão, por exemplo). */
  offline: boolean;
  backHref: string;
  onToggleKept: (kept: boolean) => void;
  onDelete: () => void;
  onChangeMascot: () => void;
};

/** O topo da tela da Caixa: mensageiro, endereço, prazo e as ações dela. */
export function InboxHeader({ inbox, now, busy, offline, backHref, onToggleKept, onDelete, onChangeMascot }: InboxHeaderProps) {
  const [confirming, setConfirming] = useState(false);
  const active = inbox.status === "active";
  const mascot = mascotById(inbox.mascot);

  return (
    <header className="inbox-head">
      <Link href={backHref} className="back-to-list">
        ‹ Suas caixas
      </Link>
      <div className="inbox-head-main">
        <button
          type="button"
          className="inbox-head-mascot"
          aria-label={`Trocar o mascote (${mascot.name})`}
          title="Trocar o mascote"
          onClick={onChangeMascot}
        >
          <MascotAvatar mascot={inbox.mascot} size="lg" decorative />
        </button>
        <div className="inbox-head-text">
          <div className="row">
            <h1 className="inbox-head-address">
              {inbox.address}
              <span className="inbox-head-domain">@{inbox.fullAddress.split("@")[1]}</span>
            </h1>
            <CopyButton text={inbox.fullAddress} ariaLabel="Copiar endereço" className="icon-button">
              <CopyIcon />
            </CopyButton>
          </div>
          <div className="row wrap inbox-head-meta">
            <span>{deadlineLong(inbox, now)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {mascot.name}, {mascot.tagline.toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {active ? (
        <div className="row wrap inbox-head-actions">
          <label className="check">
            <input type="checkbox" checked={inbox.kept} disabled={busy} onChange={(e) => onToggleKept(e.target.checked)} />
            Manter (sem prazo)
          </label>
          {confirming ? (
            <span className="row wrap" role="group" aria-label="Confirmar apagar">
              <span>Apagar a caixa e as mensagens?</span>
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
              >
                Sim, apagar
              </button>
              <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button type="button" className="link-button danger" disabled={busy} onClick={() => setConfirming(true)}>
              Apagar
            </button>
          )}
          <span className={`live${offline ? " is-offline" : ""}`}>
            <span className="dot" aria-hidden="true" />
            {offline ? "Sem conexão. Tentando de novo…" : "Atualizando a cada 5 s"}
          </span>
        </div>
      ) : null}
    </header>
  );
}
