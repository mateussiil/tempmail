import { mascotById, type MascotId } from "../domain/Mascot";

type MascotAvatarProps = {
  mascot: MascotId;
  size?: "sm" | "md" | "lg";
  /** Decorativo quando o nome do mascote já aparece ao lado. */
  decorative?: boolean;
};

const PX = { sm: 40, md: 72, lg: 96 } as const;

/** O mensageiro de uma Caixa, num quadrado arredondado com o tom dele. */
export function MascotAvatar({ mascot, size = "md", decorative = false }: MascotAvatarProps) {
  const info = mascotById(mascot);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagens pequenas e locais, sem otimização.
    <img
      src={`/mascotes/${mascot}.webp`}
      alt={decorative ? "" : info.name}
      width={PX[size]}
      height={PX[size]}
      className={`mascot-avatar mascot-${size} tone-${info.tone}`}
    />
  );
}

/** A plaquinha com o nome do mascote. */
export function MascotTag({ mascot }: { mascot: MascotId }) {
  const info = mascotById(mascot);
  return <span className={`mascot-tag tone-${info.tone}`}>{info.name}</span>;
}
