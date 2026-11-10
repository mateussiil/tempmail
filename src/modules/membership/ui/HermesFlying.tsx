import { useId } from "react";

type HermesFlyingProps = {
  className?: string;
};

const BODY =
  "M70 118C74 94 104 80 138 76C150 62 168 54 188 56C210 58 222 78 216 100C208 124 178 140 138 146C108 150 74 142 70 118Z";

/**
 * O Hermes, esguio, em pleno voo, levando uma carta: vetor no mesmo traço da marca
 * (contorno grosso, cores chapadas), com o capacete alado, os óculos e as
 * linhas de velocidade em laranja e céu. Sem fundo, serve no tema claro e no
 * escuro. Decorativo.
 */
export function HermesFlying({ className }: HermesFlyingProps) {
  // Um id por desenho: o Hermes pode aparecer mais de uma vez na mesma página.
  const clipId = `hermes-body-${useId().replace(/:/g, "")}`;
  return (
    <svg className={["hermes-flying", className].filter(Boolean).join(" ")} viewBox="0 0 250 200" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <g className="hermes-trail" fill="none" strokeLinecap="round" strokeWidth="5">
        <path className="hermes-trail-warm" d="M8 90h34" />
        <path className="hermes-trail-cool" d="M18 112h20" />
        <path className="hermes-trail-cool" d="M4 134h30" />
        <path className="hermes-trail-warm" d="M22 154h14" />
      </g>
      <g className="hermes-bird" transform="rotate(-7 140 110)" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
        {/* cauda */}
        <path className="hermes-blue" d="M80 112L36 100Q32 110 44 116L28 126Q32 138 48 132L40 146Q54 152 86 132Z" />
        {/* corpo, com a barriga branca */}
        <path className="hermes-blue" d={BODY} />
        <g clipPath={`url(#${clipId})`} stroke="none">
          <ellipse className="hermes-white" cx="174" cy="134" rx="56" ry="30" transform="rotate(-14 174 134)" />
        </g>
        <path d={BODY} fill="none" />
        <ellipse className="hermes-cheek" cx="198" cy="104" rx="7" ry="4.5" stroke="none" />
        <path className="hermes-beak" d="M214 82Q232 84 240 92Q230 99 213 98Z" />
        {/* óculos */}
        <path d="M160 76L180 82" fill="none" />
        <circle className="hermes-white" cx="192" cy="82" r="12" />
        <circle className="hermes-ink" cx="195" cy="83" r="4.8" stroke="none" />
        <circle className="hermes-white" cx="197" cy="81" r="1.6" stroke="none" />
        {/* capacete alado */}
        <path className="hermes-cap" d="M158 66C156 38 206 28 220 62C204 56 176 58 158 66Z" />
        <path className="hermes-shine" d="M178 44C184 41 194 42 200 47" fill="none" strokeWidth="3.5" />
        <path d="M154 68C176 56 208 54 228 64" fill="none" strokeWidth="6" />
        <path className="hermes-cap-band" d="M154 68C176 56 208 54 228 64" fill="none" strokeWidth="2" />
        <g transform="translate(172 50) scale(.62) translate(-136 -52)">
          <path className="hermes-white" d="M136 52C124 30 106 16 84 12C94 22 92 26 102 32C90 34 96 42 112 46C102 50 110 58 124 60Z" />
          <path d="M128 48C118 40 108 34 98 30" fill="none" strokeWidth="3" />
        </g>
        {/* asa */}
        <g transform="translate(0 -2)">
          <g className="hermes-wing">
            <path className="hermes-white" d="M132 104C124 76 104 46 70 26C74 42 68 48 78 58C66 60 70 72 84 76C74 82 82 94 98 94C94 102 106 108 132 104Z" />
            <path d="M90 54C102 66 112 80 120 94" fill="none" strokeWidth="3" />
            <path d="M84 76C96 82 106 88 112 98" fill="none" strokeWidth="3" />
          </g>
        </g>
        {/* pés e a carta */}
        <path d="M140 144l-3 9M152 143l-2 9" fill="none" strokeWidth="4" />
        <g transform="rotate(4 150 168)">
          <rect className="hermes-white" x="126" y="152" width="46" height="31" rx="5" />
          <path d="M128 155L149 171L170 155" fill="none" strokeWidth="3.5" />
          <circle className="hermes-seal" cx="149" cy="171" r="4.8" strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  );
}
