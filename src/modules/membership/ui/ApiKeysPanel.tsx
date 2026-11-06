"use client";

import { useState } from "react";
import { CopyButton } from "@/shared/ui/CopyButton";
import { shortDate, timeAgo } from "@/shared/ui/format";
import type { ApiKeyView } from "../application/ApiKeyView";
import { clientSetups } from "./clientSetups";

type CreatedKeyNoticeProps = { name: string; token: string; mcpUrl: string; onDismiss: () => void };

/**
 * A chave recém-criada: o segredo aparece só aqui. A pessoa escolhe onde vai
 * usar (Claude Code, Codex, Cursor, Grok…) e recebe os passos já com a chave.
 */
export function CreatedKeyNotice({ name, token, mcpUrl, onDismiss }: CreatedKeyNoticeProps) {
  const setups = clientSetups(mcpUrl, token);
  const [chosen, setChosen] = useState(setups[0].id);
  const setup = setups.find((s) => s.id === chosen) ?? setups[0];

  return (
    <div className="notice notice-ok" role="status">
      <strong>Chave &quot;{name}&quot; criada. Copie agora: ela não aparece de novo.</strong>
      <div className="row">
        <code className="secret mono">{token}</code>
        <CopyButton text={token} className="button button-quiet">
          Copiar
        </CopyButton>
      </div>

      <span className="small strong">Onde você vai usar?</span>
      <div role="radiogroup" aria-label="Onde você vai usar a chave" className="client-picker">
        {setups.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === setup.id}
            onClick={() => setChosen(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section aria-label={`Como conectar: ${setup.label}`} className="client-setup">
        <span className="small">{setup.hint}</span>
        {setup.steps.map((step) => (
          <div key={step.title} className="client-step">
            <span className="small">{step.title}</span>
            <div className="row align-start">
              <pre className="secret mono small">{step.code}</pre>
              <CopyButton text={step.code} className="button button-quiet">
                Copiar
              </CopyButton>
            </div>
          </div>
        ))}
        {setup.note ? <span className="small">{setup.note}</span> : null}
      </section>

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
