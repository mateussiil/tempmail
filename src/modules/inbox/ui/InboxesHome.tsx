"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { endedSession, type ApiError, type ApiResult } from "@/shared/http/apiClient";
import type { InboxGateway } from "../application/InboxGateway";
import type { InboxView } from "../application/InboxView";
import type { MascotId } from "../domain/Mascot";
import { InboxList } from "./InboxList";
import { MascotDialog } from "./MascotDialog";
import { NewInboxDialog, type NewInboxRequest } from "./NewInboxDialog";

type InboxesHomeProps = {
  inboxes: InboxGateway;
  mailDomain: string;
  ttlHours: number;
  /** Abre a tela de uma Caixa (depois de criar). */
  onOpenInbox: (inboxId: string) => void;
  inboxHref: (inboxId: string) => string;
  onSessionEnded: (reason: "anonymous" | "revoked") => void;
  pollMs?: number;
  clock?: () => Date;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ponto de entrada da home: "Suas caixas". Busca a lista (de novo a cada
 * `pollMs`, pra prazos e Caixas criadas por API ou MCP aparecerem), cria e
 * aplica as ações do menu de cada Caixa.
 */
export function InboxesHome({
  inboxes: gateway,
  mailDomain,
  ttlHours,
  onOpenInbox,
  inboxHref,
  onSessionEnded,
  pollMs = 5000,
  clock = () => new Date(),
}: InboxesHomeProps) {
  const [now, setNow] = useState(clock);
  const [list, setList] = useState<InboxView[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [changingMascot, setChangingMascot] = useState<InboxView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const clockRef = useRef(clock);
  const endedRef = useRef(onSessionEnded);
  useEffect(() => {
    clockRef.current = clock;
    endedRef.current = onSessionEnded;
  });

  const handleError = useCallback((error: ApiError): boolean => {
    const ended = endedSession(error);
    if (ended) endedRef.current(ended);
    return ended !== null;
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const result = await gateway.list();
      if (stopped) return;
      setNow(clockRef.current());
      if (result.ok) setList(result.value);
      else handleError(result.error);
    };
    void tick();
    const timer = setInterval(tick, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [gateway, pollMs, handleError]);

  function replace(updated: InboxView) {
    setList((current) => current?.map((inbox) => (inbox.id === updated.id ? updated : inbox)) ?? [updated]);
  }

  async function act(inbox: InboxView, run: () => Promise<ApiResult<InboxView>>, done?: string) {
    setBusyId(inbox.id);
    setMessage(null);
    const result = await run();
    setBusyId(null);
    if (result.ok) {
      replace(result.value);
      if (done) setMessage({ kind: "ok", text: done });
    } else if (!handleError(result.error)) {
      setMessage({ kind: "bad", text: result.error.message });
    }
  }

  async function create(request: NewInboxRequest): Promise<string | null> {
    const created = await gateway.create({ address: request.address, mascot: request.mascot });
    if (!created.ok) return handleError(created.error) ? null : created.error.message;
    if (request.keep && !created.value.inbox.kept) await gateway.setKept(created.value.inbox.id, true);
    setCreating(false);
    onOpenInbox(created.value.inbox.id);
    return null;
  }

  async function saveMascot(inbox: InboxView, mascot: MascotId): Promise<string | null> {
    const result = await gateway.setMascot(inbox.id, mascot);
    if (!result.ok) return handleError(result.error) ? null : result.error.message;
    replace(result.value);
    setChangingMascot(null);
    return null;
  }

  const checkAvailability = useCallback(
    async (address: string) => {
      const result = await gateway.checkAvailability(address);
      return result.ok ? result.value : null;
    },
    [gateway],
  );

  return (
    <main className="panel">
      <div className="panel-head">
        <h1 className="panel-title">Suas caixas</h1>
        <button type="button" className="button button-big" onClick={() => setCreating(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nova caixa
        </button>
      </div>

      {message ? (
        <p role={message.kind === "bad" ? "alert" : "status"} className={`alert ${message.kind === "bad" ? "alert-bad" : "alert-ok"}`}>
          {message.text}
        </p>
      ) : null}

      {list === null ? (
        <p className="muted" role="status">
          Carregando suas caixas…
        </p>
      ) : list.length === 0 ? (
        <div className="home-empty">
          <strong>Nenhuma caixa ainda</strong>
          <span className="muted">Crie uma caixa pra ter um endereço que recebe emails, com um mensageiro só dela.</span>
          <button type="button" className="button" onClick={() => setCreating(true)}>
            Criar a primeira caixa
          </button>
        </div>
      ) : (
        <InboxList
          inboxes={list}
          now={now}
          busyId={busyId}
          inboxHref={inboxHref}
          onCopy={async (inbox) =>
            setMessage(
              (await copyText(inbox.fullAddress))
                ? { kind: "ok", text: `${inbox.fullAddress} copiado.` }
                : { kind: "bad", text: "Não deu pra copiar o endereço." },
            )
          }
          onToggleKept={(inbox) =>
            act(inbox, () => gateway.setKept(inbox.id, !inbox.kept), inbox.kept ? `${inbox.address} voltou a ter prazo.` : `${inbox.address} mantida, sem prazo.`)
          }
          onDelete={(inbox) => act(inbox, () => gateway.remove(inbox.id), `${inbox.address} apagada.`)}
          onReactivate={(inbox) => act(inbox, () => gateway.reactivate(inbox.id, false), `${inbox.address} reativada por ${ttlHours} h.`)}
          onChangeMascot={setChangingMascot}
        />
      )}

      {creating ? (
        <NewInboxDialog
          mailDomain={mailDomain}
          ttlHours={ttlHours}
          checkAvailability={checkAvailability}
          onCreate={create}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {changingMascot ? (
        <MascotDialog
          address={changingMascot.address}
          current={changingMascot.mascot}
          onSave={(mascot) => saveMascot(changingMascot, mascot)}
          onClose={() => setChangingMascot(null)}
        />
      ) : null}
    </main>
  );
}
