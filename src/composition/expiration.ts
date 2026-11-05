import type { InboxContents } from "@/modules/inbox/application/InboxContents";
import { ExpireInboxesOfOwnersUseCase } from "@/modules/inbox/application/ExpireInboxesOfOwnersUseCase";
import { DrizzleInboxRepository } from "@/modules/inbox/infrastructure/DrizzleInboxRepository";
import { FindDepartedMembersUseCase } from "@/modules/membership/application/FindDepartedMembersUseCase";
import { Allowlist } from "@/modules/membership/domain/Allowlist";
import { DrizzleMemberDirectory } from "@/modules/membership/infrastructure/DrizzleMemberDirectory";
import { PurgeExpiredContentUseCase } from "@/modules/message/application/PurgeExpiredContentUseCase";
import { SweepOrphanFilesUseCase } from "@/modules/message/application/SweepOrphanFilesUseCase";
import type { ActiveInboxes, RawEmailBucket } from "@/modules/message/application/ports";
import { DrizzleExpiredContentStore } from "@/modules/message/infrastructure/DrizzleExpiredContentStore";
import { missingR2Env } from "@/shared/config/env";
import { withAdvisoryLock, type Locked } from "@/shared/db/advisoryLock";
import { getDb, getPool } from "@/shared/db/client";
import { logEvent, r2Store } from "./receiving";

type Log = (event: string, data?: Record<string, unknown>) => void;

/** Número fixo do lock do job no Postgres ("tmpx" em ASCII). */
export const EXPIRATION_LOCK_KEY = 0x746d7078;

export type ExpirationReport = {
  departedMembers: number | "skipped_empty_allowlist";
  expiredInboxes: number;
  purgedInboxes: number;
  deletedMessages: number;
  failedInboxes: number;
  /** `null` quando o R2 não está configurado. */
  sweptFiles: number | null;
  /** Passos que falharam inteiros (os outros rodam mesmo assim). */
  failedSteps: string[];
};

type Step<T> = { execute(): Promise<T> };

/**
 * A limpeza periódica, em três passos independentes (um que falha não impede
 * os outros): quem saiu do time tem as Caixas expiradas, as Caixas vencidas
 * perdem Mensagens e arquivos, e a varredura tira do bucket o que sobrou.
 * Roda sob um lock do Postgres: duas execuções ao mesmo tempo, aqui ou em
 * outra instância, não se atropelam (a segunda pula).
 */
export class ExpirationJob {
  constructor(
    private readonly deps: {
      lock: <T>(fn: () => Promise<T>) => Promise<Locked<T>>;
      departed: Step<{ status: "found"; memberIds: string[] } | { status: "skipped_empty_allowlist" }>;
      expireOwners: { execute(input: { ownerIds: string[] }): Promise<{ expiredInboxes: number }> };
      purge: Step<{ purgedInboxes: number; deletedMessages: number; failedInboxes: number }>;
      sweep: Step<{ deletedFiles: number }> | null;
      log: Log;
    },
  ) {}

  async run(): Promise<ExpirationReport | { skipped: "locked" }> {
    const locked = await this.deps.lock(() => this.steps());
    if (!locked.ran) {
      this.deps.log("expiration.skipped", { reason: "locked" });
      return { skipped: "locked" };
    }
    return locked.value;
  }

  private async steps(): Promise<ExpirationReport> {
    const started = Date.now();
    const report: ExpirationReport = {
      departedMembers: 0,
      expiredInboxes: 0,
      purgedInboxes: 0,
      deletedMessages: 0,
      failedInboxes: 0,
      sweptFiles: null,
      failedSteps: [],
    };
    const step = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        report.failedSteps.push(name);
        this.deps.log("expiration.step_failed", { step: name, reason: String(error) });
      }
    };

    await step("departed", async () => {
      const departed = await this.deps.departed.execute();
      if (departed.status === "skipped_empty_allowlist") {
        report.departedMembers = "skipped_empty_allowlist";
        this.deps.log("expiration.empty_allowlist", {});
        return;
      }
      report.departedMembers = departed.memberIds.length;
      if (departed.memberIds.length > 0) {
        report.expiredInboxes = (await this.deps.expireOwners.execute({ ownerIds: departed.memberIds })).expiredInboxes;
      }
    });

    // Depois da saída do time: as Caixas que acabaram de expirar já são esvaziadas nesta mesma execução.
    await step("purge", async () => {
      Object.assign(report, await this.deps.purge.execute());
    });

    if (this.deps.sweep) {
      const sweep = this.deps.sweep;
      await step("sweep", async () => {
        report.sweptFiles = (await sweep.execute()).deletedFiles;
      });
    }

    this.deps.log("expiration.run", { ...report, ms: Date.now() - started });
    return report;
  }
}

function bucket(): RawEmailBucket | null {
  // Sem R2 configurado nenhum `.eml` foi guardado: não há arquivo para apagar.
  return missingR2Env().length === 0 ? r2Store() : null;
}

function activeInboxes(repository: DrizzleInboxRepository, clock: () => Date): ActiveInboxes {
  return {
    async activeIds(ids) {
      const now = clock();
      return new Set((await repository.findByIds(ids)).filter((inbox) => inbox.isActive(now)).map((i) => i.id));
    },
  };
}

function composePurge(log: Log = logEvent) {
  return new PurgeExpiredContentUseCase({
    store: new DrizzleExpiredContentStore(getDb()),
    bucket: bucket(),
    clock: () => new Date(),
    log,
  });
}

export function composeExpirationJob(): ExpirationJob {
  const clock = () => new Date();
  const inboxes = new DrizzleInboxRepository(getDb());
  const files = bucket();

  return new ExpirationJob({
    lock: (fn) => withAdvisoryLock(getPool(), EXPIRATION_LOCK_KEY, fn),
    departed: new FindDepartedMembersUseCase({
      members: new DrizzleMemberDirectory(getDb()),
      // Lida de novo a cada execução, como no login.
      allowlist: () => Allowlist.fromString(process.env.ALLOWED_GITHUB_USERS),
    }),
    expireOwners: new ExpireInboxesOfOwnersUseCase({ repository: inboxes, clock }),
    purge: composePurge(),
    sweep: files ? new SweepOrphanFilesUseCase({ bucket: files, inboxes: activeInboxes(inboxes, clock) }) : null,
    log: logEvent,
  });
}

/**
 * Esvazia uma Caixa ao reativar. As Mensagens saem na hora; os arquivos são
 * tentados, mas uma falha no R2 não impede a reativação (eles ficam no
 * prefixo da Caixa e saem na próxima expiração dela).
 */
export function composeInboxContents(): InboxContents {
  return {
    async clear(inboxId) {
      const purge = composePurge();
      const removeFiles = purge.removeFiles(inboxId);
      await new DrizzleExpiredContentStore(getDb()).purge(inboxId, new Date(), async () => {
        try {
          await removeFiles();
        } catch (error) {
          logEvent("reactivate.files_left", { inboxId, reason: String(error) });
        }
      });
    },
  };
}

const globalForSchedule = globalThis as unknown as { __tempmailExpirationTimer?: NodeJS.Timeout };

/**
 * Agenda o job dentro do próprio servidor: uma vez logo depois de subir e
 * depois a cada `intervalMs`. Com o lock, mais de uma instância (ou o hot
 * reload do `next dev`) não roda duas vezes ao mesmo tempo.
 */
export function startExpirationSchedule(intervalMs: number, firstRunMs = 30_000): void {
  if (globalForSchedule.__tempmailExpirationTimer) return;

  const run = async () => {
    try {
      await composeExpirationJob().run();
    } catch (error) {
      logEvent("expiration.failed", { reason: String(error) });
    }
  };

  setTimeout(run, firstRunMs).unref();
  globalForSchedule.__tempmailExpirationTimer = setInterval(run, intervalMs);
  globalForSchedule.__tempmailExpirationTimer.unref();
}
