"use client";

import { useState } from "react";
import { authClient } from "@/modules/membership/infrastructure/authClient";

/** Permitir ou Recusar. O cliente do Better Auth manda o pedido assinado e segue o redirecionamento. */
export function ConsentButtons() {
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    setPending(accept ? "accept" : "deny");
    setError(null);
    const result = await authClient.oauth2.consent({ accept });
    if (result.error) {
      setPending(null);
      setError("Não deu pra registrar a resposta. O pedido pode ter vencido: tente conectar de novo.");
    }
  }

  return (
    <div className="consent-actions">
      {error ? (
        <p role="alert" className="alert alert-bad">
          {error}
        </p>
      ) : null}
      <div className="row wrap">
        <button type="button" className="button" disabled={pending !== null} onClick={() => answer(true)}>
          {pending === "accept" ? "Permitindo…" : "Permitir"}
        </button>
        <button type="button" className="button button-quiet" disabled={pending !== null} onClick={() => answer(false)}>
          {pending === "deny" ? "Recusando…" : "Recusar"}
        </button>
      </div>
    </div>
  );
}
