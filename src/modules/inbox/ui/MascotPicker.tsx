"use client";

import { MASCOTS, type MascotId } from "../domain/Mascot";
import { MascotAvatar } from "./MascotAvatar";

type MascotPickerProps = {
  value: MascotId;
  onChange: (mascot: MascotId) => void;
  /** Rótulo do grupo para leitor de tela. */
  label?: string;
};

/** A turma de mensageiros: um grid de 15, com o escolhido marcado. Setas não são necessárias: cada um é um botão. */
export function MascotPicker({ value, onChange, label = "Mascote da caixa" }: MascotPickerProps) {
  const chosen = MASCOTS.find((m) => m.id === value)!;
  return (
    <div className="mascot-picker">
      <div role="radiogroup" aria-label={label} className="mascot-grid">
        {MASCOTS.map((mascot) => (
          <button
            key={mascot.id}
            type="button"
            role="radio"
            aria-checked={mascot.id === value}
            aria-label={`${mascot.name}: ${mascot.tagline}`}
            className="mascot-option"
            onClick={() => onChange(mascot.id)}
          >
            <MascotAvatar mascot={mascot.id} size="sm" decorative />
          </button>
        ))}
      </div>
      <p className="mascot-chosen" aria-live="polite">
        <strong>{chosen.name}</strong> · {chosen.tagline}
      </p>
    </div>
  );
}
