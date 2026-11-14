"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageGateway } from "@/modules/message/application/MessageGateway";
import type { MessageDetailView, MessageSummaryView } from "@/modules/message/application/MessageView";
import { EmptyInbox, MessageList } from "@/modules/message/ui/MessageList";
import { MessageReader } from "@/modules/message/ui/MessageReader";
import { endedSession, type ApiError, type ApiResult } from "@/shared/http/apiClient";
import type { InboxGateway } from "../application/InboxGateway";
import type { InboxView } from "../application/InboxView";
import type { MascotId } from "../domain/Mascot";
import { ExpiredInboxPanel } from "./ExpiredInboxPanel";
import { InboxHeader } from "./InboxHeader";
import { MascotDialog } from "./MascotDialog";

/** No celular só uma coluna aparece por vez: a lista de Mensagens ou a leitura. */
type Pane = "messages" | "reader";

type InboxScreenProps = {
  inboxId: string;
  inboxes: InboxGateway;
  messages: MessageGateway;
  ttlHours: number;
  homeHref: string;
  onSessionEnded: (reason: "anonymous" | "revoked") => void;
  /** Abre já nesta Mensagem (o link `?mensagem=` que o MCP devolve). */
  initialMessageId?: string;
  pollMs?: number;
  clock?: () => Date;
};

/**
 * Ponto de entrada da tela de uma Caixa: as Mensagens dela (de novo a cada
 * `pollMs`) e a leitura. No computador, abre sozinha a mais recente.
 */
export function InboxScreen({
  inboxId,
  inboxes: inboxGateway,
  messages: messageGateway,
  ttlHours,
  homeHref,
  onSessionEnded,
  initialMessageId,
  pollMs = 5000,
  clock = () => new Date(),
}: InboxScreenProps) {
  const [now, setNow] = useState(clock);
  /** `undefined` carregando; `null` não existe (ou é de outro Membro). */
  const [inbox, setInbox] = useState<InboxView | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<MessageSummaryView[] | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(initialMessageId ?? null);
  const [message, setMessage] = useState<MessageDetailView | null>(null);
  const [pane, setPane] = useState<Pane>(initialMessageId ? "reader" : "messages");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [changingMascot, setChangingMascot] = useState(false);

  const clockRef = useRef(clock);
  const endedRef = useRef(onSessionEnded);
  useEffect(() => {
    clockRef.current = clock;
    endedRef.current = onSessionEnded;
  });

  const handleError = useCallback((error: ApiError): boolean => {
    const ended = endedSession(error);
    if (ended) {
      endedRef.current(ended);
      return true;
    }
    if (error.code === "network") setOffline(true);
    return false;
  }, []);

  const unwrap = useCallback(
    <T,>(result: ApiResult<T>): T | null => {
      if (result.ok) return result.value;
      handleError(result.error);
      return null;
    },
    [handleError],
  );

  const active = inbox?.status === "active";

  // A Caixa e as Mensagens dela, de novo a cada ciclo (pausado com a aba escondida).
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const list = unwrap(await inboxGateway.list());
      if (stopped || !list) return;
      setOffline(false);
      setNow(clockRef.current());
      const found = list.find((candidate) => candidate.id === inboxId) ?? null;
      setInbox(found);
      if (found?.status !== "active") return;
      const messages = unwrap(await messageGateway.list(inboxId));
      if (!stopped && messages) setLoaded(messages);
    };
    void tick();
    const timer = setInterval(tick, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [inboxId, inboxGateway, messageGateway, pollMs, unwrap]);

  const messages = active ? loaded : null;
  const shownMessageId = selectedMessageId ?? messages?.[0]?.id ?? null;

  useEffect(() => {
    if (!shownMessageId) return;
    let current = true;
    void messageGateway.get(shownMessageId).then((result) => {
      if (!current) return;
      const detail = unwrap(result);
      if (detail) setMessage(detail);
    });
    return () => {
      current = false;
    };
  }, [shownMessageId, messageGateway, unwrap]);

  const shownMessage = message && message.id === shownMessageId ? message : null;

  const loadHeaders = useCallback(
    async () => (shownMessageId ? unwrap(await messageGateway.headers(shownMessageId)) : null),
    [shownMessageId, messageGateway, unwrap],
  );

  async function act(run: () => Promise<ApiResult<InboxView>>) {
    setBusy(true);
    setActionError(null);
    const result = await run();
    setBusy(false);
    if (result.ok) {
      // Reativada: volta vazia, sem esperar o próximo ciclo.
      if (inbox?.status !== "active" && result.value.status === "active") setLoaded([]);
      setInbox(result.value);
    } else if (!handleError(result.error)) {
      setActionError(result.error.message);
    }
  }

  async function saveMascot(mascot: MascotId): Promise<string | null> {
    const result = await inboxGateway.setMascot(inboxId, mascot);
    if (!result.ok) return handleError(result.error) ? null : result.error.message;
    setInbox(result.value);
    setChangingMascot(false);
    return null;
  }

  if (inbox === undefined) {
    return (
      <main className="panel">
        <p className="muted" role="status">
          Carregando a caixa…
        </p>
      </main>
    );
  }

  if (inbox === null) {
    return (
      <main className="panel">
        <div className="home-empty">
          <strong>Caixa não encontrada</strong>
          <span className="muted">Ela não existe ou é de outra pessoa do time.</span>
          <Link href={homeHref} className="button">
            Voltar para suas caixas
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="panel inbox-screen" data-pane={pane}>
      <InboxHeader
        inbox={inbox}
        now={now}
        busy={busy}
        offline={offline}
        backHref={homeHref}
        onToggleKept={(kept) => act(() => inboxGateway.setKept(inboxId, kept))}
        onDelete={() => act(() => inboxGateway.remove(inboxId))}
        onChangeMascot={() => setChangingMascot(true)}
      />

      {actionError && active ? (
        <p role="alert" className="alert alert-bad">
          {actionError}
        </p>
      ) : null}

      {!active ? (
        <ExpiredInboxPanel
          ttlHours={ttlHours}
          busy={busy}
          error={actionError}
          onReactivate={(keep) => act(() => inboxGateway.reactivate(inboxId, keep))}
        />
      ) : messages === null ? (
        <p className="muted" role="status">
          Carregando as mensagens…
        </p>
      ) : messages.length === 0 ? (
        <EmptyInbox address={inbox.fullAddress} />
      ) : (
        <div className="inbox-columns">
          <section aria-label="Mensagens" className="pane-messages">
            <MessageList
              messages={messages}
              selectedId={shownMessageId}
              now={now}
              onSelect={(id) => {
                setSelectedMessageId(id);
                setPane("reader");
              }}
            />
          </section>
          <section aria-label="Leitura" className="pane-reader">
            {shownMessage ? (
              <MessageReader
                key={shownMessage.id}
                message={shownMessage}
                inboxAddress={inbox.fullAddress}
                now={now}
                rawUrl={messageGateway.rawUrl(shownMessage.id)}
                attachmentUrl={(index) => messageGateway.attachmentUrl(shownMessage.id, index)}
                loadHeaders={loadHeaders}
                onBack={() => setPane("messages")}
              />
            ) : (
              <p className="muted reader-placeholder">Escolha uma mensagem pra ler.</p>
            )}
          </section>
        </div>
      )}

      {changingMascot ? (
        <MascotDialog
          address={inbox.address}
          current={inbox.mascot}
          onSave={saveMascot}
          onClose={() => setChangingMascot(false)}
        />
      ) : null}
    </main>
  );
}
