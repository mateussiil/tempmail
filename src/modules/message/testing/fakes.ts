import { fail, ok, type Result } from "@/shared/result";
import type { Message } from "../domain/Message";
import type {
  DirectoryInbox,
  EmailAttachment,
  EmailContent,
  EmailHeader,
  EmailParser,
  ExpiredContentStore,
  FetchEmailError,
  InboxDirectory,
  MessageRepository,
  NewMessageSignal,
  RawDownload,
  RawEmailBucket,
  RawEmailDownloader,
  RawEmailReader,
  RawEmailStore,
  ReceivedEmailSource,
  Unsubscribe,
} from "../application/ports";

export class FakeMessageRepository implements MessageRepository {
  readonly messages = new Map<string, Message>();

  async insert(message: Message): Promise<boolean> {
    const duplicate = [...this.messages.values()].some(
      (m) => m.id === message.id || (m.emailId === message.emailId && m.inboxId === message.inboxId),
    );
    if (duplicate) return false;
    this.messages.set(message.id, message);
    return true;
  }

  async existingIds(ids: string[]): Promise<Set<string>> {
    return new Set(ids.filter((id) => this.messages.has(id)));
  }

  async listByInbox(inboxId: string, limit: number): Promise<Message[]> {
    return [...this.messages.values()]
      .filter((m) => m.inboxId === inboxId)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, limit);
  }

  async listCreatedAfter(inboxId: string, after: Date, limit: number): Promise<Message[]> {
    return [...this.messages.values()]
      .filter((m) => m.inboxId === inboxId && m.createdAt.getTime() > after.getTime())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }

  async findById(id: string): Promise<Message | null> {
    return this.messages.get(id) ?? null;
  }
}

/** Sinal em memória: `emit` faz o papel do NOTIFY do Postgres. */
export class FakeNewMessageSignal implements NewMessageSignal {
  private readonly listeners = new Map<string, Set<() => void>>();
  /** Quantas escutas estão abertas, pra conferir que ninguém esquece de fechar. */
  get active(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
  /** Chamado depois de cada `subscribe`, pra simular algo chegando nesse instante. */
  afterSubscribe: () => Promise<void> = async () => {};

  async subscribe(inboxId: string, onMessage: () => void): Promise<Unsubscribe> {
    const set = this.listeners.get(inboxId) ?? new Set();
    set.add(onMessage);
    this.listeners.set(inboxId, set);
    await this.afterSubscribe();
    return async () => {
      set.delete(onMessage);
    };
  }

  emit(inboxId: string): void {
    for (const listener of this.listeners.get(inboxId) ?? []) listener();
  }
}

export class FakeInboxDirectory implements InboxDirectory {
  constructor(private readonly inboxes: (DirectoryInbox & { ownerId: string })[]) {}

  async findByAddresses(addresses: string[]): Promise<DirectoryInbox[]> {
    return this.inboxes
      .filter((inbox) => addresses.includes(inbox.address))
      .map(({ id, address, active }) => ({ id, address, active }));
  }

  async findOwned(ownerId: string, inboxId: string): Promise<DirectoryInbox | null> {
    const found = this.inboxes.find((inbox) => inbox.id === inboxId && inbox.ownerId === ownerId);
    return found ? { id: found.id, address: found.address, active: found.active } : null;
  }
}

export class FakeReceivedEmailSource implements ReceivedEmailSource {
  calls = 0;
  /** O que `fetch` devolve; para simular falha passageira, lance dentro do `behavior`. */
  behavior: (emailId: string) => Result<EmailContent, FetchEmailError> = (emailId) =>
    ok(emailContent({ id: emailId }));

  async fetch(emailId: string): Promise<Result<EmailContent, FetchEmailError>> {
    this.calls++;
    return this.behavior(emailId);
  }
}

export class FakeRawEmailDownloader implements RawEmailDownloader {
  calls = 0;
  behavior: (url: string, maxBytes: number) => RawDownload = () => ({
    ok: true,
    bytes: new TextEncoder().encode("From: a@b.test\r\n\r\ncorpo"),
  });

  async download(url: string, maxBytes: number): Promise<RawDownload> {
    this.calls++;
    return this.behavior(url, maxBytes);
  }
}

export class FakeRawEmailStore implements RawEmailStore, RawEmailBucket {
  readonly objects = new Map<string, Uint8Array>();
  /** Para simular falha do R2 numa chave. */
  failOn: (key: string) => boolean = () => false;

  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (this.failOn(key)) throw new Error(`R2 indisponível para ${key}`);
    this.objects.set(key, bytes);
  }

  async listKeys(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async deleteKeys(keys: string[]): Promise<void> {
    for (const key of keys) {
      if (this.failOn(key)) throw new Error(`R2 indisponível para ${key}`);
      this.objects.delete(key);
    }
  }
}

/**
 * O conteúdo das Caixas expiradas, sobre o repositório falso de Mensagens. O
 * teste diz quando cada Caixa expira (`expiresAt`; ausente = ativa).
 */
export class FakeExpiredContentStore implements ExpiredContentStore {
  readonly expiresAt = new Map<string, Date | null>();

  constructor(private readonly messages: FakeMessageRepository) {}

  private isExpired(inboxId: string, now: Date): boolean {
    const at = this.expiresAt.get(inboxId);
    return at instanceof Date && at.getTime() <= now.getTime();
  }

  async inboxesWithContent(now: Date, limit: number): Promise<string[]> {
    const ids = new Set([...this.messages.messages.values()].map((m) => m.inboxId));
    return [...ids].filter((id) => this.isExpired(id, now)).slice(0, limit);
  }

  async purge(inboxId: string, now: Date, removeFiles: () => Promise<void>): Promise<number | null> {
    if (!this.isExpired(inboxId, now)) return null;
    const doomed = [...this.messages.messages.values()].filter((m) => m.inboxId === inboxId);
    await removeFiles(); // se falhar, nada sai (como o rollback da transação)
    for (const message of doomed) this.messages.messages.delete(message.id);
    return doomed.length;
  }
}

/** O `.eml` guardado, por chave. */
export class FakeRawEmailReader implements RawEmailReader {
  readonly objects = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }
}

/** Devolve o que o teste mandar, sem abrir MIME de verdade. */
export class FakeEmailParser implements EmailParser {
  headers: EmailHeader[] = [{ name: "Subject", value: "oi" }];
  attachments: EmailAttachment[] = [];

  async parse(): Promise<{ headers: EmailHeader[]; attachments: EmailAttachment[] }> {
    return { headers: this.headers, attachments: this.attachments };
  }
}

export function emailContent(overrides: Partial<EmailContent> = {}): EmailContent {
  return {
    id: "email-1",
    from: "noreply@github.com",
    fromHeader: "GitHub <noreply@github.com>",
    subject: "Seu código de verificação",
    html: "<p>Use o código <b>482913</b></p>",
    text: "Use o código 482913",
    messageId: "<msg-1@github.com>",
    rawDownloadUrl: "https://raw.example.test/email-1",
    attachments: [],
    receivedAt: new Date("2026-11-05T12:00:00Z"),
    ...overrides,
  };
}

export { fail, ok };
