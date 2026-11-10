import { useId } from "react";

type HermesFlyingProps = {
  className?: string;
};

const BODY =
  "M70 122C66 84 100 54 142 52C184 50 210 78 206 112C202 148 168 166 126 164C94 162 72 148 70 122Z";

/**
 * O Hermes em pleno voo, levando uma carta: vetor no mesmo traço da marca
 * (contorno grosso, cores chapadas), com o capacete alado, os óculos e as
 * linhas de velocidade em laranja e céu. Sem fundo, serve no tema claro e no
 * escuro. Decorativo.
 */
export function HermesFlying({ className }: HermesFlyingProps) {
  // Um id por desenho: o Hermes pode aparecer mais de uma vez na mesma página.
  const clipId = `hermes-body-${useId().replace(/:/g, "")}`;
  return (
    <svg className={["hermes-flying", className].filter(Boolean).join(" ")} viewBox="0 0 250 210" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <g className="hermes-trail" fill="none" strokeLinecap="round" strokeWidth="5">
        <path className="hermes-trail-warm" d="M8 96h34" />
        <path className="hermes-trail-cool" d="M18 120h20" />
        <path className="hermes-trail-cool" d="M4 144h30" />
        <path className="hermes-trail-warm" d="M22 166h14" />
      </g>
      <g className="hermes-bird" transform="rotate(-7 140 120)" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
        {/* cauda */}
        <path className="hermes-blue" d="M82 128L44 114Q40 124 50 130L36 140Q40 152 54 146L48 160Q60 166 88 148Z" />
        {/* corpo, com a barriga branca */}
        <path className="hermes-blue" d={BODY} />
        <g clipPath={`url(#${clipId})`} stroke="none">
          <ellipse className="hermes-white" cx="168" cy="142" rx="56" ry="42" />
        </g>
        <path d={BODY} fill="none" />
        <ellipse className="hermes-cheek" cx="186" cy="118" rx="9" ry="5.5" stroke="none" />
        <path className="hermes-beak" d="M203 96Q222 98 231 106Q221 113 203 112Z" />
        {/* óculos */}
        <path d="M140 84L167 91" fill="none" />
        <circle className="hermes-white" cx="181" cy="92" r="14" />
        <circle className="hermes-ink" cx="184" cy="93" r="5.5" stroke="none" />
        <circle className="hermes-white" cx="186.2" cy="90.8" r="1.8" stroke="none" />
        {/* capacete alado */}
        <path className="hermes-cap" d="M124 70C120 38 184 22 206 66C186 58 150 60 124 70Z" />
        <path className="hermes-shine" d="M158 44C166 40 178 42 186 48" fill="none" strokeWidth="4" />
        <path d="M120 72C146 58 190 56 216 68" fill="none" strokeWidth="6" />
        <path className="hermes-cap-band" d="M120 72C146 58 190 56 216 68" fill="none" strokeWidth="2" />
        <g transform="translate(146 54) scale(.72) translate(-136 -52)">
          <path className="hermes-white" d="M136 52C124 30 106 16 84 12C94 22 92 26 102 32C90 34 96 42 112 46C102 50 110 58 124 60Z" />
          <path d="M128 48C118 40 108 34 98 30" fill="none" strokeWidth="3" />
        </g>
        {/* asa */}
        <g transform="translate(-6 10)">
          <g className="hermes-wing">
            <path className="hermes-white" d="M128 112C120 82 100 50 66 30C70 46 64 52 74 62C62 64 66 76 80 80C70 86 78 98 94 98C90 106 102 114 128 112Z" />
            <path d="M86 58C98 70 108 84 116 100" fill="none" strokeWidth="3" />
            <path d="M80 80C92 86 102 92 108 102" fill="none" strokeWidth="3" />
          </g>
        </g>
        {/* pés e a carta */}
        <path d="M134 158l-3 9M146 160l-2 8" fill="none" strokeWidth="4" />
        <g transform="rotate(4 150 180)">
          <rect className="hermes-white" x="126" y="164" width="48" height="33" rx="5" />
          <path d="M128 167L150 184L172 167" fill="none" strokeWidth="3.5" />
          <circle className="hermes-seal" cx="150" cy="184" r="5" strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  );
}
