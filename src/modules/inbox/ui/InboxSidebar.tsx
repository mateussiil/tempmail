import { deadlineShort } from "@/shared/ui/format";
import type { InboxView } from "../application/InboxView";

type InboxSidebarProps = {
  inboxes: InboxView[] | null;
  selectedId: string | null;
  now: Date;
  onSelect: (inboxId: string) => void;
  onNew: () => void;
};

function InboxButton({
  inbox,
  selected,
  now,
  onSelect,
}: {
  inbox: InboxView;
  selected: boolean;
  now: Date;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`inbox-item${selected ? " is-selected" : ""}${inbox.status === "expired" ? " is-expired" : ""}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="mono ellipsis">{inbox.address}</span>
        <span className="inbox-item-meta">{deadlineShort(inbox, now)}</span>
      </button>
    </li>
  );
}

/** A coluna das Caixas: o botão de criar, as ativas e as expiradas. */
export function InboxSidebar({ inboxes, selectedId, now, onSelect, onNew }: InboxSidebarProps) {
  const active = inboxes?.filter((inbox) => inbox.status === "active") ?? [];
  const expired = inboxes?.filter((inbox) => inbox.status === "expired") ?? [];

  return (
    <nav aria-label="Suas caixas" className="pane pane-inboxes">
      <button type="button" className="button button-block" onClick={onNew}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nova caixa
      </button>

      {inboxes === null ? (
        <p className="muted" role="status">
          Carregando…
        </p>
      ) : inboxes.length === 0 ? (
        <p className="muted">Você ainda não tem caixas. Crie uma pra receber emails.</p>
      ) : null}

      {active.length > 0 ? (
        <section aria-labelledby="inboxes-active">
          <h2 id="inboxes-active" className="eyebrow">
            Ativas
          </h2>
          <ul className="plain-list">
            {active.map((inbox) => (
              <InboxButton
                key={inbox.id}
                inbox={inbox}
                now={now}
                selected={inbox.id === selectedId}
                onSelect={() => onSelect(inbox.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {expired.length > 0 ? (
        <section aria-labelledby="inboxes-expired">
          <h2 id="inboxes-expired" className="eyebrow">
            Expiradas
          </h2>
          <ul className="plain-list">
            {expired.map((inbox) => (
              <InboxButton
                key={inbox.id}
                inbox={inbox}
                now={now}
                selected={inbox.id === selectedId}
                onSelect={() => onSelect(inbox.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </nav>
  );
}
