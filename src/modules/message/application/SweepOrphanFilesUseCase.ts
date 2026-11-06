import { Message, RAW_PREFIX } from "../domain/Message";
import type { ActiveInboxes, RawEmailBucket } from "./ports";

/**
 * Varredura do bucket: apaga os arquivos de Caixas que não estão ativas (ou
 * que nem existem). Pega o que a expiração deixou para trás numa falha parcial
 * e um `.eml` gravado logo depois de a Caixa expirar.
 *
 * Lista antes de consultar as Caixas: um arquivo novo de uma Caixa reativada
 * depois da consulta não está na lista, então nunca é apagado por engano.
 */
export class SweepOrphanFilesUseCase {
  constructor(private readonly deps: { bucket: RawEmailBucket; inboxes: ActiveInboxes }) {}

  async execute(): Promise<{ deletedFiles: number }> {
    const keys = await this.deps.bucket.listKeys(RAW_PREFIX);

    // Chaves fora do padrão `caixas/<id>/…` não são do app: ficam onde estão.
    const byInbox = new Map<string, string[]>();
    for (const key of keys) {
      const inboxId = Message.inboxIdOfKey(key);
      if (inboxId) byInbox.set(inboxId, [...(byInbox.get(inboxId) ?? []), key]);
    }

    const active = await this.deps.inboxes.activeIds([...byInbox.keys()]);
    const orphans = [...byInbox.entries()].filter(([id]) => !active.has(id)).flatMap(([, list]) => list);

    if (orphans.length > 0) await this.deps.bucket.deleteKeys(orphans);
    return { deletedFiles: orphans.length };
  }
}
