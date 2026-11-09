/**
 * A turma de mensageiros: cada Caixa tem um mascote, escolhido por quem cria
 * (ou sorteado). É identidade visual, não muda nenhuma regra da Caixa.
 */
export const MASCOTS = [
  { id: "hermes", name: "Hermes", tagline: "O mensageiro chefe", tone: "amber" },
  { id: "corvo", name: "Corvo", tagline: "Entrega rápida", tone: "lilac" },
  { id: "pomba", name: "Pomba", tagline: "Mensagens confiáveis", tone: "sky" },
  { id: "raposa", name: "Raposa", tagline: "Entrega discreta", tone: "amber" },
  { id: "gato", name: "Gato", tagline: "Automações e API", tone: "lilac" },
  { id: "polvo", name: "Polvo", tagline: "Múltiplas caixas", tone: "lilac" },
  { id: "tartaruga", name: "Tartaruga", tagline: "Caixas duradouras", tone: "mint" },
  { id: "coelho", name: "Coelho", tagline: "Criação rápida", tone: "amber" },
  { id: "baleia", name: "Baleia", tagline: "Alto volume", tone: "sky" },
  { id: "coruja", name: "Coruja", tagline: "Suporte e alertas", tone: "lilac" },
  { id: "camaleao", name: "Camaleão", tagline: "Identidades temporárias", tone: "mint" },
  { id: "pica-pau", name: "Pica-pau", tagline: "Notificações em tempo real", tone: "amber" },
  { id: "lontra", name: "Lontra", tagline: "Mensagens leves", tone: "sky" },
  { id: "guaxinim", name: "Guaxinim", tagline: "Caixas de testes", tone: "lilac" },
  { id: "capivara", name: "Capivara", tagline: "Uso no dia a dia", tone: "amber" },
] as const;

export type MascotId = (typeof MASCOTS)[number]["id"];
export type Mascot = (typeof MASCOTS)[number];

export const MASCOT_IDS: readonly MascotId[] = MASCOTS.map((m) => m.id);

export function isMascotId(value: unknown): value is MascotId {
  return typeof value === "string" && (MASCOT_IDS as readonly string[]).includes(value);
}

export function mascotById(id: MascotId): Mascot {
  return MASCOTS.find((m) => m.id === id)!;
}

/**
 * O mascote de uma Caixa criada antes de existir a escolha: sai do endereço,
 * então é sempre o mesmo para a mesma Caixa.
 */
export function defaultMascotFor(address: string): MascotId {
  let hash = 0;
  for (const char of address) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return MASCOT_IDS[hash % MASCOT_IDS.length];
}
