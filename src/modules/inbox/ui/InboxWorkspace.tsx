"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageGateway } from "@/modules/message/application/MessageGateway";
import type { MessageDetailView, MessageSummaryView } from "@/modules/message/application/MessageView";
import { EmptyInbox, MessageList } from "@/modules/message/ui/MessageList";
import { MessageReader } from "@/modules/message/ui/MessageReader";
import { endedSession, type ApiError, type ApiResult } from "@/shared/http/apiClient";
import type { InboxGateway } from "../application/InboxGateway";
import type { InboxView } from "../application/InboxView";
import { ExpiredInboxPanel } from "./ExpiredInboxPanel";
import { InboxHeader } from "./InboxHeader";
import { InboxSidebar } from "./InboxSidebar";
import { NewInboxDialog, type NewInboxRequest } from "./NewInboxDialog";

/** No celular só uma coluna aparece por vez: a lista, a Caixa ou a Mensagem. */
type Pane = "inboxes" | "messages" | "reader";

type InboxWorkspaceProps = {
  inboxes: InboxGateway;
  messages: MessageGateway;
  mailDomain: string;
  ttlHours: number;
  /** A sessão acabou ou o Membro saiu da lista: a página leva para a tela certa. */
  onSessionEnded: (reason: "anonymous" | "revoked") => void;
  pollMs?: number;
  /** O relógio da tela (os testes fixam). */
  clock?: () => Date;
};

/**
 * Ponto de entrada da tela de Caixas. Coordena: busca as Caixas e as Mensagens
 * pelos gateways (de novo a cada `pollMs`), guarda o que está selecionado e
 * chama as ações. Os componentes só apresentam e avisam a intenção.
 */
export function InboxWorkspace({
  inboxes: inboxGateway,
  messages: messageGateway,
  mailDomain,
  ttlHours,
  onSessionEnded,
  pollMs = 5000,
  clock = () => new Date(),
}: InboxWorkspaceProps) {
  const [now, setNow] = useState(clock);
  const [inboxes, setInboxes] = useState<InboxView[] | null>(null);
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  /** As Mensagens guardadas junto da Caixa a que pertencem. */
  const [loaded, setLoaded] = useState<{ inboxId: string; list: MessageSummaryView[] } | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageDetailView | null>(null);
  const [pane, setPane] = useState<Pane>("inboxes");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const clockRef = useRef(clock);
  const sessionEndedRef = useRef(onSessionEnded);
  useEffect(() => {
    clockRef.current = clock;
    sessionEndedRef.current = onSessionEnded;
  });

  /** Trata o erro comum a todos os pedidos; devolve `true` se a página deve parar. */
  const handleError = useCallback((error: ApiError): boolean => {
    const ended = endedSession(error);
    if (ended) {
      sessionEndedRef.current(ended);
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

  const selectedInbox = inboxes?.find((inbox) => inbox.id === selectedInboxId) ?? null;

  const refreshInboxes = useCallback(async () => {
    const list = unwrap(await inboxGateway.list());
    if (!list) return;
    setOffline(false);
    setInboxes(list);
    // Sem nada escolhido (ou se a escolhida sumiu), fica com a primeira ativa.
    setSelectedInboxId((current) =>
      current && list.some((inbox) => inbox.id === current)
        ? current
        : (list.find((inbox) => inbox.status === "active") ?? list[0])?.id ?? null,
    );
  }, [inboxGateway, unwrap]);

  const refreshMessages = useCallback(
    async (inboxId: string) => {
      const list = unwrap(await messageGateway.list(inboxId));
      if (list) setLoaded({ inboxId, list });
    },
    [messageGateway, unwrap],
  );

  // Primeira carga e o polling (pausado com a aba escondida).
  const inboxRef = useRef<string | null>(null);
  const pollingInboxId = selectedInbox?.status === "active" ? selectedInbox.id : null;
  useEffect(() => {
    inboxRef.current = pollingInboxId;
  }, [pollingInboxId]);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setNow(clockRef.current());
      await refreshInboxes();
      if (!stopped && inboxRef.current) await refreshMessages(inboxRef.current);
    };
    void tick();
    const timer = setInterval(tick, pollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pollMs, refreshInboxes, refreshMessages]);

  // Trocou de Caixa: busca as Mensagens dela na hora, sem esperar o próximo ciclo.
  const activeInboxId = selectedInbox?.status === "active" ? selectedInbox.id : null;
  useEffect(() => {
    if (!activeInboxId) return;
    let current = true;
    void messageGateway.list(activeInboxId).then((result) => {
      if (!current) return;
      const list = unwrap(result);
      if (list) setLoaded({ inboxId: activeInboxId, list });
    });
    return () => {
      current = false;
    };
  }, [activeInboxId, messageGateway, unwrap]);

  const messages = loaded && loaded.inboxId === activeInboxId ? loaded.list : null;

  // A Mensagem escolhida (no computador, a mais recente, se nenhuma foi escolhida).
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

  function selectInbox(inboxId: string) {
    setSelectedInboxId(inboxId);
    setSelectedMessageId(null);
    setActionError(null);
    setPane("messages");
  }

  function selectMessage(messageId: string) {
    setSelectedMessageId(messageId);
    setPane("reader");
  }

  function replaceInbox(updated: InboxView) {
    setInboxes((list) => list?.map((inbox) => (inbox.id === updated.id ? updated : inbox)) ?? [updated]);
  }

  async function act(run: () => Promise<ApiResult<InboxView>>) {
    setBusy(true);
    setActionError(null);
    const result = await run();
    setBusy(false);
    if (result.ok) {
      replaceInbox(result.value);
      return result.value;
    }
    if (!handleError(result.error)) setActionError(result.error.message);
    return null;
  }

  async function create(request: NewInboxRequest): Promise<string | null> {
    const created = await inboxGateway.create({ address: request.address });
    if (!created.ok) {
      if (handleError(created.error)) return null;
      return created.error.message;
    }
    let inbox = created.value.inbox;
    if (request.keep && !inbox.kept) {
      const kept = await inboxGateway.setKept(inbox.id, true);
      if (kept.ok) inbox = kept.value;
    }
    setInboxes((list) => [inbox, ...(list ?? []).filter((other) => other.id !== inbox.id)]);
    setSelectedInboxId(inbox.id);
    setSelectedMessageId(null);
    setPane("messages");
    setCreating(false);
    return null;
  }

  const checkAvailability = useCallback(
    async (address: string) => {
      const result = await inboxGateway.checkAvailability(address);
      return result.ok ? result.value : null;
    },
    [inboxGateway],
  );

  const loadHeaders = useCallback(
    async () => (shownMessageId ? unwrap(await messageGateway.headers(shownMessageId)) : null),
    [shownMessageId, messageGateway, unwrap],
  );

  const back = (to: Pane) => () => setPane(to);

  return (
    <div className="workspace" data-pane={pane}>
      <InboxSidebar
        inboxes={inboxes}
        selectedId={selectedInboxId}
        now={now}
        onSelect={selectInbox}
        onNew={() => setCreating(true)}
      />

      <section aria-label="Mensagens" className="pane pane-messages">
        {selectedInbox?.status === "active" ? (
          <>
            <InboxHeader
              inbox={selectedInbox}
              now={now}
              busy={busy}
              offline={offline}
              onBack={back("inboxes")}
              onToggleKept={(kept) => act(() => inboxGateway.setKept(selectedInbox.id, kept))}
              onDelete={() => act(() => inboxGateway.remove(selectedInbox.id))}
            />
            {actionError ? (
              <p role="alert" className="alert alert-bad">
                {actionError}
              </p>
            ) : null}
            {messages === null ? (
              <p className="muted pad" role="status">
                Carregando…
              </p>
            ) : messages.length === 0 ? (
              <EmptyInbox address={selectedInbox.fullAddress} />
            ) : (
              <MessageList messages={messages} selectedId={shownMessageId} now={now} onSelect={selectMessage} />
            )}
          </>
        ) : selectedInbox ? (
          <ExpiredInboxPanel
            key={selectedInbox.id}
            inbox={selectedInbox}
            now={now}
            ttlHours={ttlHours}
            busy={busy}
            error={actionError}
            onBack={back("inboxes")}
            onReactivate={(keep) => act(() => inboxGateway.reactivate(selectedInbox.id, keep))}
          />
        ) : inboxes && inboxes.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhuma caixa ainda</strong>
            <span className="muted small">Crie uma caixa pra ter um endereço que recebe emails.</span>
            <button type="button" className="button" onClick={() => setCreating(true)}>
              Nova caixa
            </button>
          </div>
        ) : null}
      </section>

      <section aria-label="Leitura" className="pane pane-reader">
        {shownMessage && selectedInbox?.status === "active" ? (
          <MessageReader
            key={shownMessage.id}
            message={shownMessage}
            inboxAddress={selectedInbox.fullAddress}
            now={now}
            rawUrl={messageGateway.rawUrl(shownMessage.id)}
            attachmentUrl={(index) => messageGateway.attachmentUrl(shownMessage.id, index)}
            loadHeaders={loadHeaders}
            onBack={back("messages")}
          />
        ) : messages && messages.length > 0 ? (
          <p className="muted reader-placeholder">Escolha uma mensagem pra ler.</p>
        ) : null}
      </section>

      {creating ? (
        <NewInboxDialog
          mailDomain={mailDomain}
          ttlHours={ttlHours}
          checkAvailability={checkAvailability}
          onCreate={create}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
