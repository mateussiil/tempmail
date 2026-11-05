import { ADDRESS_MAX_LENGTH, ADDRESS_MIN_LENGTH, type AddressProblem } from "../domain/InboxAddress";

/** Erros de negócio dos casos de uso de Caixa. */
export type InboxError =
  | { code: "invalid_address"; problem: AddressProblem }
  /** O endereço pertence a outro Membro. */
  | { code: "address_taken" }
  /** O endereço é do próprio Membro e já está ativo. */
  | { code: "already_active" }
  | { code: "limit_reached"; max: number }
  /** Não existe, ou não é do Membro (as duas coisas parecem iguais de fora). */
  | { code: "not_found" }
  /** A operação exige Caixa ativa e esta expirou. */
  | { code: "not_active" }
  /** A operação exige Caixa expirada e esta está ativa. */
  | { code: "not_expired" };

export function describeInboxError(error: InboxError): string {
  switch (error.code) {
    case "invalid_address":
      return error.problem === "length"
        ? `O nome precisa ter de ${ADDRESS_MIN_LENGTH} a ${ADDRESS_MAX_LENGTH} caracteres.`
        : "Use só letras, números, ponto e hífen, sem começar nem terminar com ponto ou hífen.";
    case "address_taken":
      return "Esse endereço pertence a outro membro do time. Escolha outro nome.";
    case "already_active":
      return "Você já tem uma Caixa ativa com esse endereço.";
    case "limit_reached":
      return `Você já tem ${error.max} Caixas ativas. Apague uma antes de criar outra.`;
    case "not_found":
      return "Caixa não encontrada.";
    case "not_active":
      return "Essa Caixa expirou. Reative-a primeiro.";
    case "not_expired":
      return "Essa Caixa ainda está ativa.";
  }
}
