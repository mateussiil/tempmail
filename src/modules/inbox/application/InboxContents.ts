/**
 * O que uma Caixa guarda (Mensagens e arquivos), que é de outro módulo. A
 * Caixa só precisa pedir para esvaziar: ao reativar, ela "recomeça vazia".
 */
export interface InboxContents {
  /** Apaga as Mensagens e os arquivos de uma Caixa expirada. */
  clear(inboxId: string): Promise<void>;
}
