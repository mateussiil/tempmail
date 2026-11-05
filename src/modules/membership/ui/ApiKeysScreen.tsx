"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { endedSession, type ApiError } from "@/shared/http/apiClient";
import type { ApiKeyGateway } from "../application/ApiKeyGateway";
import type { ApiKeyView } from "../application/ApiKeyView";
import { ApiKeyTable, CreatedKeyNotice, NewKeyForm } from "./ApiKeysPanel";

type ApiKeysScreenProps = {
  gateway: ApiKeyGateway;
  /** Endereço público do MCP, para o comando do Claude Code. */
  mcpUrl: string;
  onSessionEnded: (reason: "anonymous" | "revoked") => void;
  clock?: () => Date;
};

/** Ponto de entrada da tela de Chaves de API: lista, cria (mostrando o segredo uma vez) e revoga. */
export function ApiKeysScreen({ gateway, mcpUrl, onSessionEnded, clock = () => new Date() }: ApiKeysScreenProps) {
  const [keys, setKeys] = useState<ApiKeyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [now] = useState(clock);

  const sessionEndedRef = useRef(onSessionEnded);
  useEffect(() => {
    sessionEndedRef.current = onSessionEnded;
  });

  const fail = useCallback((apiError: ApiError) => {
    const ended = endedSession(apiError);
    if (ended) sessionEndedRef.current(ended);
    else setError(apiError.message);
  }, []);

  const load = useCallback(async () => {
    const result = await gateway.list();
    if (result.ok) setKeys(result.value);
    else fail(result.error);
  }, [gateway, fail]);

  useEffect(() => {
    let current = true;
    void gateway.list().then((result) => {
      if (!current) return;
      if (result.ok) setKeys(result.value);
      else fail(result.error);
    });
    return () => {
      current = false;
    };
  }, [gateway, fail]);

  async function create(name: string): Promise<string | null> {
    const result = await gateway.create(name);
    if (!result.ok) {
      if (endedSession(result.error)) {
        fail(result.error);
        return null;
      }
      return result.error.message;
    }
    setCreated({ name: result.value.key.name, token: result.value.token });
    setCreating(false);
    await load();
    return null;
  }

  async function revoke(keyId: string) {
    const result = await gateway.revoke(keyId);
    if (!result.ok) fail(result.error);
    await load();
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Chaves de API</h1>
        {!creating ? (
          <button type="button" className="button" onClick={() => setCreating(true)}>
            Nova chave
          </button>
        ) : null}
      </div>

      {creating ? <NewKeyForm onCreate={create} onCancel={() => setCreating(false)} /> : null}
      {created ? (
        <CreatedKeyNotice name={created.name} token={created.token} mcpUrl={mcpUrl} onDismiss={() => setCreated(null)} />
      ) : null}
      {error ? (
        <p role="alert" className="alert alert-bad">
          {error}
        </p>
      ) : null}

      {keys === null ? (
        <p className="muted" role="status">
          Carregando…
        </p>
      ) : (
        <ApiKeyTable keys={keys} now={now} onRevoke={revoke} />
      )}

      <p className="muted small">
        Cada chave tem os mesmos poderes que você na página e vale até ser revogada. Use em{" "}
        <code className="mono">Authorization: Bearer tm_…</code> na API ou no MCP ({mcpUrl}).
      </p>
    </main>
  );
}
