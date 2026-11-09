import { useId } from "react";

type HermesFlyingProps = {
  className?: string;
};

const SILHOUETTE =
  "M92 104C112 84 140 70 166 62C172 50 196 44 212 52C228 60 230 92 214 106C198 122 170 136 136 140C114 142 96 136 90 124C87 116 88 109 92 104Z";

/**
 * O Hermes em pleno voo, desenhado em vetor no mesmo traço da marca: contorno
 * grosso, cores chapadas e as linhas de velocidade em laranja e céu. Sem fundo,
 * então serve no tema claro e no escuro. Decorativo.
 */
export function HermesFlying({ className }: HermesFlyingProps) {
  // Um id por desenho: o Hermes pode aparecer mais de uma vez na mesma página.
  const clipId = `hermes-body-${useId().replace(/:/g, "")}`;
  return (
    <svg className={["hermes-flying", className].filter(Boolean).join(" ")} viewBox="0 0 260 180" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <path d={SILHOUETTE} />
        </clipPath>
      </defs>
      <g className="hermes-trail" fill="none" strokeLinecap="round" strokeWidth="5">
        <path className="hermes-trail-warm" d="M12 76h40" />
        <path className="hermes-trail-cool" d="M28 102h24" />
        <path className="hermes-trail-cool" d="M8 128h40" />
        <path className="hermes-trail-warm" d="M34 152h20" />
      </g>
      <g className="hermes-bird" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path className="hermes-blue" d="M100 108L54 96L66 114L48 132L102 126Z" />
        <path className="hermes-blue" d={SILHOUETTE} />
        <g clipPath={`url(#${clipId})`} stroke="none">
          <ellipse className="hermes-white" cx="176" cy="138" rx="66" ry="34" transform="rotate(-22 176 138)" />
        </g>
        <path d={SILHOUETTE} fill="none" />
        <path className="hermes-beak" d="M220 70L246 80L219 90Z" />
        <circle className="hermes-white" cx="203" cy="76" r="10" />
        <circle className="hermes-ink" cx="206" cy="77" r="3.6" stroke="none" />
        <path d="M193 75h-8" fill="none" />
        <path className="hermes-cap" d="M164 66C162 38 206 32 220 58L231 63C214 62 188 60 164 66Z" />
        <path className="hermes-white" d="M172 52C158 38 144 32 128 34C138 40 134 44 142 48C136 52 146 58 164 58Z" />
        <g className="hermes-wing">
          <path className="hermes-white" d="M156 98C148 66 126 38 88 22C100 40 94 48 106 58C96 62 100 72 114 76C106 82 114 92 130 94Z" />
          <path d="M116 62C128 72 136 82 144 94" fill="none" strokeWidth="3" />
        </g>
      </g>
    </svg>
  );
}
