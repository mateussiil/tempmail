"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AddressAvailability } from "../application/CheckAddressUseCase";
import { ADDRESS_MAX_LENGTH, ADDRESS_MIN_LENGTH, parseInboxAddress } from "../domain/InboxAddress";

type Status =
  | { kind: "empty" }
  | { kind: "checking" }
  | { kind: "invalid"; problem: "length" | "characters" }
  | { kind: "free" }
  | { kind: "yours_expired" }
  | { kind: "yours_active" }
  | { kind: "taken" }
  | { kind: "unknown" };

export type NewInboxRequest = { address?: string; keep: boolean };

type NewInboxDialogProps = {
  mailDomain: string;
  ttlHours: number;
  /** Diz o que aconteceria ao criar o endereço; `null` se não deu pra consultar. */
  checkAvailability: (address: string) => Promise<AddressAvailability | null>;
  /** Cria (ou reativa). Devolve a mensagem de erro, ou `null` se deu certo. */
  onCreate: (request: NewInboxRequest) => Promise<string | null>;
  onClose: () => void;
  /** Espera antes de consultar o servidor enquanto a pessoa digita. */
  debounceMs?: number;
};

const HINTS: Record<Status["kind"], string> = {
  empty: "Letras, números, ponto e hífen.",
  checking: "Conferindo…",
  invalid: "",
  free: "Disponível. O endereço fica seu para sempre.",
  yours_expired: "Esse endereço já é seu e está expirado. Criar vai reativá-lo, vazio.",
  yours_active: "Você já tem uma caixa ativa com esse endereço.",
  taken: "Esse endereço pertence a outro membro do time. Escolha outro nome.",
  unknown: "Não deu pra conferir agora. Você ainda pode tentar criar.",
};

function hintFor(status: Status): string {
  if (status.kind !== "invalid") return HINTS[status.kind];
  return status.problem === "length"
    ? `O nome precisa ter de ${ADDRESS_MIN_LENGTH} a ${ADDRESS_MAX_LENGTH} caracteres.`
    : "Use só letras, números, ponto e hífen, sem começar nem terminar com ponto ou hífen.";
}

const TONE: Record<Status["kind"], "neutral" | "ok" | "info" | "bad"> = {
  empty: "neutral",
  checking: "neutral",
  invalid: "bad",
  free: "ok",
  yours_expired: "info",
  yours_active: "bad",
  taken: "bad",
  unknown: "neutral",
};

/** Criar Caixa: aleatória ou com nome escolhido (validado enquanto digita), com a opção Manter. */
export function NewInboxDialog({
  mailDomain,
  ttlHours,
  checkAvailability,
  onCreate,
  onClose,
  debounceMs = 300,
}: NewInboxDialogProps) {
  const titleId = useId();
  const hintId = useId();
  const [mode, setMode] = useState<"random" | "chosen">("random");
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(false);
  /** A resposta do servidor, guardada junto do nome que ela responde. */
  const [remote, setRemote] = useState<{ address: string; status: Status } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const firstControl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (mode === "chosen" ? nameInput.current : firstControl.current)?.focus();
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Valida na hora pela regra do domínio; só pergunta ao servidor um nome válido, depois de uma pausa.
  const parsed = name.trim() === "" ? null : parseInboxAddress(name);
  const validAddress = parsed?.ok ? parsed.value : null;
  const status: Status =
    parsed === null
      ? { kind: "empty" }
      : !parsed.ok
        ? { kind: "invalid", problem: parsed.problem }
        : remote?.address === validAddress
          ? remote.status
          : { kind: "checking" };

  useEffect(() => {
    if (mode !== "chosen" || validAddress === null) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await checkAvailability(validAddress);
      if (!current) return;
      setRemote({
        address: validAddress,
        status: !result
          ? { kind: "unknown" }
          : result.availability === "invalid"
            ? { kind: "invalid", problem: result.problem }
            : { kind: result.availability },
      });
    }, debounceMs);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [mode, validAddress, checkAvailability, debounceMs]);

  const blocked =
    mode === "chosen" && ["empty", "checking", "invalid", "yours_active", "taken"].includes(status.kind);
  const cta = mode === "chosen" && status.kind === "yours_expired" ? "Reativar caixa" : "Criar caixa";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || submitting) return;
    setSubmitting(true);
    setError(null);
    const failure = await onCreate(mode === "chosen" ? { address: name.trim().toLowerCase(), keep } : { keep });
    setSubmitting(false);
    if (failure) setError(failure);
  }

  const tone = mode === "chosen" ? TONE[status.kind] : "neutral";

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog" onSubmit={submit}>
        <h1 id={titleId} className="dialog-title">
          Nova caixa
        </h1>

        <div role="radiogroup" aria-label="Tipo de endereço" className="segmented">
          <button
            ref={firstControl}
            type="button"
            role="radio"
            aria-checked={mode === "random"}
            onClick={() => setMode("random")}
          >
            Aleatório
          </button>
          <button type="button" role="radio" aria-checked={mode === "chosen"} onClick={() => setMode("chosen")}>
            Escolher nome
          </button>
        </div>

        {mode === "random" ? (
          <div className="field">
            <span className="muted small">Endereço</span>
            <div className="address-preview mono">
              <span className="muted">8 letras e números aleatórios</span>@{mailDomain}
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="new-inbox-name" className="muted small">
              Nome do endereço
            </label>
            <div className={`address-input tone-${tone}`}>
              <input
                ref={nameInput}
                id="new-inbox-name"
                className="mono"
                value={name}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                maxLength={ADDRESS_MAX_LENGTH + 10}
                aria-describedby={hintId}
                aria-invalid={tone === "bad"}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="mono muted">@{mailDomain}</span>
            </div>
            <p id={hintId} className={`hint tone-${tone}`} aria-live="polite">
              {hintFor(status)}
            </p>
          </div>
        )}

        <div className="field">
          <span className="muted small">Duração</span>
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Manter (sem prazo, até você apagar)
          </label>
          <span className="muted small">
            Sem marcar, a caixa expira em {ttlHours} h e as mensagens são apagadas.
          </span>
        </div>

        {error ? (
          <p role="alert" className="alert alert-bad">
            {error}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button" disabled={blocked || submitting}>
            {submitting ? "Criando…" : cta}
          </button>
        </div>
      </form>
    </div>
  );
}
