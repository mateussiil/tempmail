import { fail, ok, type Result } from "@/shared/result";
import type { Message } from "../domain/Message";
import type {
  DirectoryInbox,
  EmailContent,
  FetchEmailError,
  InboxDirectory,
  MessageRepository,
  RawDownload,
  RawEmailDownloader,
  RawEmailStore,
  ReceivedEmailSource,
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

  async findById(id: string): Promise<Message | null> {
    return this.messages.get(id) ?? null;
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

export class FakeRawEmailStore implements RawEmailStore {
  readonly objects = new Map<string, Uint8Array>();
  /** Para simular falha do R2 numa chave. */
  failOn: (key: string) => boolean = () => false;

  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (this.failOn(key)) throw new Error(`R2 indisponível para ${key}`);
    this.objects.set(key, bytes);
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
