import { Message } from "../domain/Message";
import type { ExpiredContentStore, RawEmailBucket } from "./ports";

const BATCH = 50;

export type PurgeReport = { purgedInboxes: number; deletedMessages: number; failedInboxes: number };

/**
 * Caixa expirada não tem mais Mensagens: apaga as linhas e os arquivos do
 * prefixo `caixas/<id>/` no bucket. Uma Caixa que falha não para as outras;
 * fica para a próxima execução. Sem bucket (R2 não configurado), nenhum
 * arquivo foi guardado, então só as linhas saem.
 */
export class PurgeExpiredContentUseCase {
  constructor(
    private readonly deps: {
      store: ExpiredContentStore;
      bucket: RawEmailBucket | null;
      clock: () => Date;
      log: (event: string, data?: Record<string, unknown>) => void;
    },
  ) {}

  /** Remove os arquivos de uma Caixa (também usado ao reativar). */
  removeFiles(inboxId: string): () => Promise<void> {
    const { bucket } = this.deps;
    return async () => {
      if (!bucket) return;
      const keys = await bucket.listKeys(Message.inboxPrefix(inboxId));
      if (keys.length > 0) await bucket.deleteKeys(keys);
    };
  }

  async execute(): Promise<PurgeReport> {
    const now = this.deps.clock();
    const report: PurgeReport = { purgedInboxes: 0, deletedMessages: 0, failedInboxes: 0 };
    // Cada Caixa é tentada uma vez por execução, mesmo que volte na consulta.
    const seen = new Set<string>();

    for (;;) {
      const pending = (await this.deps.store.inboxesWithContent(now, BATCH + seen.size)).filter(
        (id) => !seen.has(id),
      );
      if (pending.length === 0) return report;

      for (const inboxId of pending) {
        seen.add(inboxId);
        try {
          const deleted = await this.deps.store.purge(inboxId, now, this.removeFiles(inboxId));
          if (deleted === null) continue;
          report.purgedInboxes++;
          report.deletedMessages += deleted;
        } catch (error) {
          report.failedInboxes++;
          this.deps.log("expiration.purge_failed", { inboxId, reason: String(error) });
        }
      }
    }
  }
}
