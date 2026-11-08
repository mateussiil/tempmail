"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deadlineLong } from "@/shared/ui/format";
import type { InboxView } from "../application/InboxView";
import { MascotAvatar, MascotTag } from "./MascotAvatar";

export type InboxActions = {
  onCopy: (inbox: InboxView) => void;
  onToggleKept: (inbox: InboxView) => void;
  onDelete: (inbox: InboxView) => void;
  onReactivate: (inbox: InboxView) => void;
  onChangeMascot: (inbox: InboxView) => void;
};

type InboxListProps = InboxActions & {
  inboxes: InboxView[];
  now: Date;
  /** A Caixa com um pedido em andamento (botões dela ficam travados). */
  busyId: string | null;
  inboxHref: (inboxId: string) => string;
};

function RowMenu({ inbox, actions, onAskDelete }: { inbox: InboxView; actions: InboxActions; onAskDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = inbox.status === "active";

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && box.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = (label: string, run: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={danger ? "is-danger" : undefined}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="row-menu" ref={box}>
      <button
        type="button"
        className="row-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mais ações para ${inbox.address}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="row-menu-list">
          {item("Copiar endereço", () => actions.onCopy(inbox))}
          {active ? item(inbox.kept ? "Deixar de manter" : "Manter (sem prazo)", () => actions.onToggleKept(inbox)) : null}
          {!active ? item("Reativar", () => actions.onReactivate(inbox)) : null}
          {item("Trocar mascote", () => actions.onChangeMascot(inbox))}
          {active ? item("Apagar", onAskDelete, true) : null}
        </div>
      ) : null}
    </div>
  );
}

function InboxRow({
  inbox,
  now,
  busy,
  href,
  actions,
}: {
  inbox: InboxView;
  now: Date;
  busy: boolean;
  href: string;
  actions: InboxActions;
}) {
  const [confirming, setConfirming] = useState(false);
  const expired = inbox.status === "expired";

  return (
    <li className={`inbox-row${expired ? " is-expired" : ""}`} aria-busy={busy || undefined}>
      <Link href={href} className="inbox-row-link">
        <MascotAvatar mascot={inbox.mascot} decorative />
        <span className="inbox-row-text">
          <span className="inbox-row-address">{inbox.address}</span>
          <span className="inbox-row-meta">{deadlineLong(inbox, now)}</span>
        </span>
      </Link>

      {confirming ? (
        <div className="inbox-row-confirm" role="group" aria-label={`Apagar ${inbox.address}`}>
          <span>Apagar a caixa e as mensagens?</span>
          <button
            type="button"
            className="button button-danger"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              actions.onDelete(inbox);
            }}
          >
            Apagar
          </button>
          <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="inbox-row-side">
          {expired ? (
            <button type="button" className="reactivate-link" disabled={busy} onClick={() => actions.onReactivate(inbox)}>
              Reativar
            </button>
          ) : null}
          <MascotTag mascot={inbox.mascot} />
          <RowMenu inbox={inbox} actions={actions} onAskDelete={() => setConfirming(true)} />
        </div>
      )}
    </li>
  );
}

/** "Suas caixas": ativas primeiro (como a API devolve), cada uma com o seu mensageiro. */
export function InboxList({ inboxes, now, busyId, inboxHref, ...actions }: InboxListProps) {
  return (
    <ul className="inbox-list" aria-label="Suas caixas">
      {inboxes.map((inbox) => (
        <InboxRow
          key={inbox.id}
          inbox={inbox}
          now={now}
          busy={busyId === inbox.id}
          href={inboxHref(inbox.id)}
          actions={actions}
        />
      ))}
    </ul>
  );
}
