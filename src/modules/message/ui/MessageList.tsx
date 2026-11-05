import { CopyButton } from "@/shared/ui/CopyButton";
import { timeAgo } from "@/shared/ui/format";
import type { MessageSummaryView } from "../application/MessageView";

type MessageListProps = {
  messages: MessageSummaryView[];
  selectedId: string | null;
  now: Date;
  onSelect: (messageId: string) => void;
};

/** "GitHub <noreply@github.com>" vira "GitHub"; sem nome, fica o endereço. */
export function senderName(from: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from);
  return match && match[1] ? match[1] : from;
}

/** As Mensagens da Caixa, as mais recentes primeiro, com o código já à vista. */
export function MessageList({ messages, selectedId, now, onSelect }: MessageListProps) {
  return (
    <ul className="plain-list message-list" aria-label="Mensagens">
      {messages.map((message) => (
        <li key={message.id}>
          <button
            type="button"
            className={`message-item${message.id === selectedId ? " is-selected" : ""}`}
            aria-current={message.id === selectedId ? "true" : undefined}
            onClick={() => onSelect(message.id)}
          >
            <span className="row between">
              <span className="strong ellipsis">{senderName(message.from)}</span>
              <span className="muted small nowrap">{timeAgo(message.receivedAt, now)}</span>
            </span>
            <span className="ellipsis">{message.subject || "(sem assunto)"}</span>
            {message.verificationCode ? <span className="code-chip mono">código {message.verificationCode}</span> : null}
            {message.status !== "ready" ? <span className="muted small">conteúdo indisponível</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Caixa sem nenhuma Mensagem ainda. */
export function EmptyInbox({ address }: { address: string }) {
  return (
    <div className="empty-state">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
      <strong>Esperando o primeiro email</strong>
      <span className="muted small">Use o endereço no cadastro. A página atualiza sozinha a cada 5 s.</span>
      <CopyButton text={address} className="button button-quiet">
        Copiar endereço
      </CopyButton>
    </div>
  );
}
