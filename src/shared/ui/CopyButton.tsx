"use client";

import { useEffect, useState, type ReactNode } from "react";

type CopyButtonProps = {
  text: string;
  /** Rótulo visível (ou só o ícone, com `ariaLabel`). */
  children?: ReactNode;
  ariaLabel?: string;
  className?: string;
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copia `text` e avisa "Copiado" por um instante (também para leitor de tela). */
export function CopyButton({ text, children, ariaLabel, className = "button" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      onClick={async () => setState((await copy(text)) ? "copied" : "failed")}
    >
      {children ?? "Copiar"}
      <span className="copy-feedback" role="status" aria-live="polite">
        {state === "copied" ? "Copiado" : state === "failed" ? "Não deu pra copiar" : ""}
      </span>
    </button>
  );
}
