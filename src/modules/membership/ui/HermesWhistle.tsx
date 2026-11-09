"use client";

import { useRef, useState } from "react";
import { HermesFlying } from "./HermesFlying";

/**
 * O Hermes da apresentação: um toque e ele assobia e passa rasgando o céu.
 * O som só toca a pedido (nada de autoplay) e a animação respeita quem
 * prefere menos movimento.
 */
export function HermesWhistle() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [flying, setFlying] = useState(false);

  function whistle() {
    audio.current ??= new Audio("/sons/hermes-assobio.mp3");
    audio.current.currentTime = 0;
    void audio.current.play().catch(() => {});
    setFlying(false);
    requestAnimationFrame(() => setFlying(true));
  }

  return (
    <button
      type="button"
      className="landing-hermes"
      data-flying={flying || undefined}
      onClick={whistle}
      onAnimationEnd={(event) => {
        if (event.animationName === "hermes-dash") setFlying(false);
      }}
      aria-label="Ouvir o Hermes passar assobiando"
      title="Ouvir o Hermes"
    >
      <HermesFlying />
    </button>
  );
}
