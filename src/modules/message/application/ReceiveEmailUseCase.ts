import { Message } from "../domain/Message";
import { pickRecipientAddresses, type ReceivedEmailEvent } from "./ReceivedEmailEvent";
import type {
  DirectoryInbox,
  InboxDirectory,
  MessageRepository,
  RawEmailDownloader,
  RawEmailStore,
  ReceivedEmailSource,
} from "./ports";

export type ReceiveEmailDeps = {
  directory: InboxDirectory;
  source: ReceivedEmailSource;
  downloader: RawEmailDownloader;
  store: RawEmailStore;
  repository: MessageRepository;
  /** Domínio dos endereços das Caixas, ex.: `tmp.mateussiil.com.br`. */
  mailDomain: string;
  /** Tamanho máximo do `.eml`; acima disso só os metadados são guardados. */
  maxMessageBytes: number;
  clock: () => Date;
  log: (event: string, data?: Record<string, unknown>) => void;
};

export type ReceiveOutcome =
  /** Nenhum destinatário no nosso domínio. */
  | { kind: "not_for_us" }
  /** Endereços nossos, mas sem Caixa ativa: o email é descartado (Email órfão). */
  | { kind: "orphan"; addresses: string[] }
  /** Já estava tudo gravado (o Resend reenviou o aviso). */
  | { kind: "duplicate" }
  /** O Resend não conhece o email: nada a fazer, e reenviar não adianta. */
  | { kind: "email_not_found" }
  | { kind: "stored"; messages: { id: string; inboxId: string; status: Message["status"] }[] };

/**
 * Processa um aviso `email.received`: acha as Caixas ativas de destino, busca o
 * email no Resend, baixa o `.eml` na hora (o link expira em cerca de 1 h),
 * guarda o `.eml` no R2 e os campos prontos no Postgres.
 *
 * É seguro repetir: o id da Mensagem vem do email e da Caixa, então reenviar
 * não duplica e uma nova tentativa sobrescreve o mesmo arquivo no R2. Falhas
 * passageiras (`TransientError`) sobem, pro webhook responder erro e o Resend
 * tentar de novo.
 */
export class ReceiveEmailUseCase {
  constructor(private readonly deps: ReceiveEmailDeps) {}

  async execute(event: ReceivedEmailEvent): Promise<ReceiveOutcome> {
    const { deps } = this;
    const now = deps.clock();

    const addresses = pickRecipientAddresses(event, deps.mailDomain);
    if (addresses.length === 0) {
      deps.log("receive.not_for_us", { emailId: event.emailId });
      return { kind: "not_for_us" };
    }

    const inboxes = (await deps.directory.findByAddresses(addresses)).filter((i) => i.active);
    if (inboxes.length === 0) {
      deps.log("receive.orphan", { emailId: event.emailId, addresses });
      return { kind: "orphan", addresses };
    }

    const existing = await deps.repository.existingIds(
      inboxes.map((inbox) => Message.idFor(event.emailId, inbox.id)),
    );
    const pending = inboxes.filter((inbox) => !existing.has(Message.idFor(event.emailId, inbox.id)));
    if (pending.length === 0) {
      deps.log("receive.duplicate", { emailId: event.emailId });
      return { kind: "duplicate" };
    }

    const fetched = await deps.source.fetch(event.emailId);
    if (!fetched.ok) {
      if (fetched.error.code === "quota_exceeded") {
        deps.log("receive.quota_exceeded", { emailId: event.emailId });
        return this.storeWithoutContent(event, pending, "quota_exceeded", now);
      }
      deps.log("receive.email_not_found", { emailId: event.emailId });
      return { kind: "email_not_found" };
    }
    const content = fetched.value;

    const download = content.rawDownloadUrl
      ? await deps.downloader.download(content.rawDownloadUrl, deps.maxMessageBytes)
      : null;
    if (download && !download.ok) {
      deps.log("receive.too_large", { emailId: event.emailId, maxBytes: deps.maxMessageBytes });
      return this.storeWithoutContent(event, pending, "too_large", now);
    }
    if (!download) deps.log("receive.no_raw_url", { emailId: event.emailId });

    const stored: { id: string; inboxId: string; status: Message["status"] }[] = [];
    for (const inbox of pending) {
      const id = Message.idFor(event.emailId, inbox.id);
      const rawKey = download ? Message.rawKeyFor(inbox.id, id) : null;
      if (download && rawKey) await deps.store.put(rawKey, download.bytes, "message/rfc822");

      const message = Message.ready({
        inboxId: inbox.id,
        emailId: event.emailId,
        messageId: content.messageId ?? event.messageId,
        fromAddress: (content.from || event.from).trim().toLowerCase(),
        fromHeader: content.fromHeader,
        subject: content.subject || event.subject,
        textBody: content.text,
        htmlBody: content.html,
        rawKey,
        rawSize: download ? download.bytes.byteLength : null,
        attachments: content.attachments.length > 0 ? content.attachments : event.attachments,
        receivedAt: content.receivedAt ?? event.receivedAt ?? now,
        createdAt: now,
      });

      if (await deps.repository.insert(message)) {
        stored.push({ id, inboxId: inbox.id, status: message.status });
      }
    }

    deps.log("receive.stored", { emailId: event.emailId, messages: stored.length });
    return { kind: "stored", messages: stored };
  }

  private async storeWithoutContent(
    event: ReceivedEmailEvent,
    inboxes: DirectoryInbox[],
    status: "quota_exceeded" | "too_large",
    now: Date,
  ): Promise<ReceiveOutcome> {
    const stored: { id: string; inboxId: string; status: Message["status"] }[] = [];

    for (const inbox of inboxes) {
      const message = Message.withoutContent(
        {
          inboxId: inbox.id,
          emailId: event.emailId,
          messageId: event.messageId,
          fromAddress: event.from.trim().toLowerCase(),
          subject: event.subject,
          attachments: event.attachments,
          receivedAt: event.receivedAt ?? now,
          createdAt: now,
        },
        status,
      );
      if (await this.deps.repository.insert(message)) {
        stored.push({ id: message.id, inboxId: inbox.id, status });
      }
    }

    return { kind: "stored", messages: stored };
  }
}
