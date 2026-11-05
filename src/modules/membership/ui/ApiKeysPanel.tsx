"use client";

import { useState } from "react";
import { CopyButton } from "@/shared/ui/CopyButton";
import { shortDate, timeAgo } from "@/shared/ui/format";
import type { ApiKeyView } from "../application/ApiKeyView";

/** O comando pronto para conectar o Claude Code ao MCP com esta chave. */
export function claudeMcpCommand(mcpUrl: string, token: string): string {
  return `claude mcp add --transport http tempmail ${mcpUrl} --header "Authorization: Bearer ${token}"`;
}

type CreatedKeyNoticeProps = { name: string; token: string; mcpUrl: string; onDismiss: () => void };

/** A chave recém-criada: o segredo aparece só aqui, com o comando do Claude Code pronto. */
export function CreatedKeyNotice({ name, token, mcpUrl, onDismiss }: CreatedKeyNoticeProps) {
  const command = claudeMcpCommand(mcpUrl, token);
  return (
    <div className="notice notice-ok" role="status">
      <strong>Chave &quot;{name}&quot; criada. Copie agora: ela não aparece de novo.</strong>
      <div className="row">
        <code className="secret mono">{token}</code>
        <CopyButton text={token} className="button button-quiet">
          Copiar
        </CopyButton>
      </div>
      <span className="small">No Claude Code:</span>
      <div className="row">
        <code className="secret mono small">{command}</code>
        <CopyButton text={command} className="button button-quiet">
          Copiar comando
        </CopyButton>
      </div>
      <button type="button" className="link-button" onClick={onDismiss}>
        Já copiei
      </button>
    </div>
  );
}

type NewKeyFormProps = {
  /** Devolve a mensagem de erro, ou `null` se criou. */
  onCreate: (name: string) => Promise<string | null>;
  onCancel: () => void;
};

export function NewKeyForm({ onCreate, onCancel }: NewKeyFormProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="new-key"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(await onCreate(name));
        setPending(false);
      }}
    >
      <label htmlFor="key-name" className="muted small">
        Nome da chave (onde ela vai ser usada)
      </label>
      <div className="row wrap">
        <input
          id="key-name"
          className="text-input"
          value={name}
          maxLength={60}
          placeholder="Claude Code do notebook"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="button" disabled={pending || name.trim() === ""}>
          {pending ? "Criando…" : "Criar chave"}
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {error ? (
        <p role="alert" className="alert alert-bad">
          {error}
        </p>
      ) : null}
    </form>
  );
}

type ApiKeyTableProps = {
  keys: ApiKeyView[];
  now: Date;
  onRevoke: (keyId: string) => void;
};

function KeyRow({ apiKey, now, onRevoke }: { apiKey: ApiKeyView; now: Date; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const revoked = apiKey.revokedAt !== null;

  return (
    <li className={`key-row${revoked ? " is-revoked" : ""}`}>
      <span className="key-name">{apiKey.name}</span>
      <span className="mono muted">{apiKey.prefix}…</span>
      <span className="muted">
        <span className="key-label">Criada </span>
        {shortDate(new Date(apiKey.createdAt), now)}
      </span>
      <span className="muted">
        <span className="key-label">Último uso </span>
        {apiKey.lastUsedAt ? timeAgo(apiKey.lastUsedAt, now) : "nunca"}
      </span>
      <span className="key-action">
        {revoked ? (
          <span className="muted small">revogada</span>
        ) : confirming ? (
          <span className="row">
            <button type="button" className="button button-danger" onClick={onRevoke}>
              Revogar
            </button>
            <button type="button" className="link-button" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="button button-danger-quiet"
            aria-label={`Revogar a chave ${apiKey.name}`}
            onClick={() => setConfirming(true)}
          >
            Revogar
          </button>
        )}
      </span>
    </li>
  );
}

/** As chaves do Membro: nome, prefixo, criação, último uso e Revogar. */
export function ApiKeyTable({ keys, now, onRevoke }: ApiKeyTableProps) {
  if (keys.length === 0) {
    return <p className="muted">Nenhuma chave ainda. Crie uma pra usar a API ou o MCP.</p>;
  }
  return (
    <div className="keys-box">
      <div className="key-row key-head" aria-hidden="true">
        <span>Nome</span>
        <span>Chave</span>
        <span>Criada</span>
        <span>Último uso</span>
        <span />
      </div>
      <ul className="plain-list" aria-label="Suas chaves">
        {keys.map((key) => (
          <KeyRow key={key.id} apiKey={key} now={now} onRevoke={() => onRevoke(key.id)} />
        ))}
      </ul>
    </div>
  );
}
