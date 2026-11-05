import { fail, ok, type Result } from "@/shared/result";
import type { Message } from "../domain/Message";
import { extractVerificationLinks } from "../domain/verificationLinks";
import type { InboxDirectory, MessageRepository, NewMessageSignal } from "./ports";
import { toSummaryView, type MessageSummaryView } from "./MessageView";

export const DEFAULT_WAIT_SECONDS = 45;
export const MAX_WAIT_SECONDS = 120;
/** De quanto em quanto tempo avisa o progresso (e confere o banco, caso um aviso se perca). */
export const DEFAULT_PROGRESS_INTERVAL_MS = 10_000;

const PAGE_SIZE = 100;
/** Quantas Mensagens olha, no máximo, procurando uma que passe nos filtros. */
const MAX_SCANNED = 1_000;
const PREVIEW_CHARS = 500;

export type WaitError =
  /** A Caixa não existe ou é de outro Membro. */
  | { code: "not_found" }
  /** Uma Caixa expirada não recebe mais nada: esperar seria inútil. */
  | { code: "inbox_expired" };

export type WaitedMessageView = MessageSummaryView & {
  /** Começo do texto (conteúdo de terceiros, não confiável). */
  preview: string | null;
  /** Links que parecem de confirmação primeiro (conteúdo de terceiros). */
  links: string[];
};

export type WaitOutcome =
  | { status: "received"; message: WaitedMessageView; cursor: string }
  /**
   * Chegou, mas sem conteúdo: a cota do Resend estourou ou passou do tamanho
   * máximo. Esperar mais não traria o código, então devolve na hora.
   */
  | {
      status: "content_unavailable";
      reason: "quota_exceeded" | "too_large";
      message: WaitedMessageView;
      cursor: string;
    }
  /** Nada chegou no prazo. Não é erro: chame de novo com `cursor`. */
  | { status: "timeout"; waitedSeconds: number; cursor: string }
  /** Quem chamou desistiu (o pedido foi cancelado). */
  | { status: "cancelled" };

export type WaitInput = {
  ownerId: string;
  inboxId: string;
  timeoutMs: number;
  /**
   * Só conta o que foi gravado depois disso (o `cursor` de uma resposta
   * anterior). Sem ele, vale a Mensagem mais recente que já está na Caixa.
   */
  since?: Date | null;
  /** Trecho do remetente (nome ou endereço), sem diferenciar maiúsculas. */
  fromContains?: string;
  /** Trecho do assunto, sem diferenciar maiúsculas. */
  subjectContains?: string;
  signal?: AbortSignal;
  /** Chamado a cada intervalo enquanto espera; falhas aqui são ignoradas. */
  onProgress?: (elapsedMs: number) => void | Promise<void>;
};

export type WaitDeps = {
  directory: InboxDirectory;
  repository: MessageRepository;
  signal: NewMessageSignal;
  clock: () => Date;
  progressIntervalMs?: number;
};

function contains(haystack: string, needle: string | undefined): boolean {
  return !needle || haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function toWaitedView(message: Message): WaitedMessageView {
  const text = message.textBody?.trim() || null;
  return {
    ...toSummaryView(message),
    preview: text ? text.slice(0, PREVIEW_CHARS) : null,
    links: extractVerificationLinks({ text: message.textBody, html: message.htmlBody }),
  };
}

/**
 * Espera a próxima Mensagem de uma Caixa do Membro (long-poll), para agentes
 * que acabaram de pedir um email de verificação.
 *
 * Confere o banco antes de escutar (o email pode já ter chegado), escuta o
 * aviso de Mensagem nova, confere de novo (fecha a janela entre a consulta e a
 * escuta) e então espera o aviso, o prazo ou o cancelamento. A cada intervalo
 * avisa o progresso e confere o banco mesmo sem aviso, caso a escuta tenha
 * caído. Não consome nada: chamar de novo com o mesmo cursor dá o mesmo resultado.
 */
export class WaitForMessageUseCase {
  constructor(private readonly deps: WaitDeps) {}

  async execute(input: WaitInput): Promise<Result<WaitOutcome, WaitError>> {
    const startedAt = this.deps.clock();

    const inbox = await this.deps.directory.findOwned(input.ownerId, input.inboxId);
    if (!inbox) return fail({ code: "not_found" });
    if (!inbox.active) return fail({ code: "inbox_expired" });

    const found = await this.find(input);
    if (found) return ok(this.outcome(found));

    let woken = false;
    let wake: () => void = () => {};
    const unsubscribe = await this.deps.signal.subscribe(inbox.id, () => {
      woken = true;
      wake();
    });

    try {
      const interval = this.deps.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
      const deadline = startedAt.getTime() + input.timeoutMs;
      let nextProgress = startedAt.getTime() + interval;

      for (;;) {
        woken = false;
        const message = await this.find(input);
        if (message) return ok(this.outcome(message));
        if (input.signal?.aborted) return ok({ status: "cancelled" });

        const now = this.deps.clock().getTime();
        if (now >= deadline) {
          return ok({
            status: "timeout",
            waitedSeconds: Math.round((now - startedAt.getTime()) / 1000),
            cursor: (input.since ?? startedAt).toISOString(),
          });
        }
        if (now >= nextProgress) {
          nextProgress += interval;
          await this.reportProgress(input, now - startedAt.getTime());
        }

        // Um aviso que chegou durante a consulta já vale: confere de novo sem dormir.
        if (woken) continue;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, Math.max(0, Math.min(deadline, nextProgress) - now));
          input.signal?.addEventListener("abort", done, { once: true });
          wake = done;
          function done() {
            clearTimeout(timer);
            input.signal?.removeEventListener("abort", done);
            resolve();
          }
        });
        wake = () => {};
      }
    } finally {
      await unsubscribe();
    }
  }

  private async reportProgress(input: WaitInput, elapsedMs: number): Promise<void> {
    try {
      await input.onProgress?.(elapsedMs);
    } catch {
      // O cliente pode ter ido embora; o cancelamento chega pelo `signal`.
    }
  }

  private matches(message: Message, input: WaitInput): boolean {
    return (
      contains(`${message.fromHeader ?? ""} ${message.fromAddress}`, input.fromContains) &&
      contains(message.subject, input.subjectContains)
    );
  }

  private async find(input: WaitInput): Promise<Message | null> {
    if (!input.since) {
      // Sem cursor: a mais recente que passe nos filtros.
      const latest = await this.deps.repository.listByInbox(input.inboxId, PAGE_SIZE);
      return latest.find((message) => this.matches(message, input)) ?? null;
    }

    // Com cursor: a primeira gravada depois dele que passe nos filtros.
    let after = input.since;
    for (let scanned = 0; scanned < MAX_SCANNED; scanned += PAGE_SIZE) {
      const page = await this.deps.repository.listCreatedAfter(input.inboxId, after, PAGE_SIZE);
      const match = page.find((message) => this.matches(message, input));
      if (match) return match;
      if (page.length < PAGE_SIZE) return null;
      after = page[page.length - 1].createdAt;
    }
    return null;
  }

  private outcome(message: Message): WaitOutcome {
    const view = toWaitedView(message);
    const cursor = message.createdAt.toISOString();
    if (message.status === "ready") return { status: "received", message: view, cursor };
    return { status: "content_unavailable", reason: message.status, message: view, cursor };
  }
}
