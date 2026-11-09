"use client";

import { useEffect, useId, useState } from "react";
import type { MascotId } from "../domain/Mascot";
import { MascotPicker } from "./MascotPicker";

type MascotDialogProps = {
  address: string;
  current: MascotId;
  /** Devolve a mensagem de erro, ou `null` se trocou. */
  onSave: (mascot: MascotId) => Promise<string | null>;
  onClose: () => void;
};

/** Trocar o mascote de uma Caixa. */
export function MascotDialog({ address, current, onSave, onClose }: MascotDialogProps) {
  const titleId = useId();
  const [mascot, setMascot] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const failure = await onSave(mascot);
          setSaving(false);
          if (failure) setError(failure);
        }}
      >
        <h1 id={titleId} className="dialog-title">
          Mascote de <span className="mono">{address}</span>
        </h1>
        <MascotPicker value={mascot} onChange={setMascot} />
        {error ? (
          <p role="alert" className="alert alert-bad">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button" disabled={saving || mascot === current}>
            {saving ? "Trocando…" : "Trocar mascote"}
          </button>
        </div>
      </form>
    </div>
  );
}
