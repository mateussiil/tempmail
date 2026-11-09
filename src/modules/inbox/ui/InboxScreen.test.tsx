import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxRepositoryDirectory } from "@/composition/inboxDirectory";
import { Message } from "@/modules/message/domain/Message";
import { FakeMessageGateway } from "@/modules/message/testing/FakeMessageGateway";
import { FakeInboxGateway } from "../testing/FakeInboxGateway";
import { InboxScreen } from "./InboxScreen";

// Gateways falsos que rodam os casos de uso reais sobre repositórios em memória.
function setup(options: { pollMs?: number } = {}) {
  const inboxes = new FakeInboxGateway();
  const directory = new InboxRepositoryDirectory(inboxes.test.repository, inboxes.test.deps.clock);
  const messages = new FakeMessageGateway(directory);
  const onSessionEnded = vi.fn();
  const now = inboxes.test.now();

  const create = async (address: string) => {
    const result = await inboxes.create({ address, mascot: "raposa" });
    if (!result.ok) throw new Error(result.error.message);
    return result.value.inbox;
  };

  const deliver = async (inboxId: string, emailId: string, overrides: Partial<Parameters<typeof Message.ready>[0]> = {}) => {
    await messages.repository.insert(
      Message.ready({
        inboxId,
        emailId,
        messageId: null,
        fromAddress: "noreply@github.com",
        fromHeader: "GitHub <noreply@github.com>",
        subject: "Seu código de verificação",
        textBody: "Use o código 482913 para continuar.",
        htmlBody: "<p>Use o código <b>482913</b> para continuar.</p>",
        rawKey: `caixas/${inboxId}/x.eml`,
        rawSize: 10,
        attachments: [],
        receivedAt: new Date(now.getTime() - 60_000),
        createdAt: new Date(now.getTime() - 60_000),
        ...overrides,
      }),
    );
  };

  const renderScreen = (inboxId: string) =>
    render(
      <InboxScreen
        inboxId={inboxId}
        inboxes={inboxes}
        messages={messages}
        ttlHours={24}
        homeHref="/"
        onSessionEnded={onSessionEnded}
        pollMs={options.pollMs ?? 60_000}
        clock={() => now}
      />,
    );

  return { inboxes, messages, create, deliver, onSessionEnded, renderScreen };
}

const user = () => userEvent.setup();

describe("InboxScreen", () => {
  it("mostra o mascote, o endereço e abre a Mensagem mais recente com o código em destaque", async () => {
    const s = setup();
    const inbox = await s.create("cadastro");
    await s.deliver(inbox.id, "e1");

    s.renderScreen(inbox.id);

    expect(await screen.findByRole("heading", { name: /cadastro/ })).toHaveTextContent("cadastro@tmp.exemplo.test");
    expect(screen.getByRole("button", { name: "Trocar o mascote (Raposa)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ Suas caixas" })).toHaveAttribute("href", "/");
    expect(await screen.findByText("482913", { selector: ".code-card-value" })).toBeInTheDocument();
  });

  it("Caixa de outro Membro (ou que não existe) mostra o aviso e a volta", async () => {
    const s = setup();
    const other = await s.inboxes.seedForOtherMember("alheia");

    s.renderScreen(other.id);

    expect(await screen.findByText("Caixa não encontrada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para suas caixas" })).toHaveAttribute("href", "/");
  });

  it("Caixa sem Mensagens mostra a espera", async () => {
    const s = setup();
    const inbox = await s.create("vazia");

    s.renderScreen(inbox.id);

    expect(await screen.findByText("Esperando o primeiro email")).toBeInTheDocument();
  });

  it("mantém, apaga com confirmação e reativa", async () => {
    const s = setup();
    const inbox = await s.create("ciclo");
    s.renderScreen(inbox.id);
    const u = user();

    await u.click(await screen.findByRole("checkbox", { name: "Manter (sem prazo)" }));
    expect(await screen.findByText("Mantida, sem prazo")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Apagar" }));
    await u.click(screen.getByRole("button", { name: "Sim, apagar" }));
    expect(await screen.findByText("Esta caixa expirou")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Reativar por 24 h" }));
    expect(await screen.findByText("Esperando o primeiro email")).toBeInTheDocument();
  });

  it("troca o mascote pelo avatar", async () => {
    const s = setup();
    const inbox = await s.create("bicho");
    s.renderScreen(inbox.id);
    const u = user();

    await u.click(await screen.findByRole("button", { name: "Trocar o mascote (Raposa)" }));
    const dialog = screen.getByRole("dialog", { name: /Mascote de/ });
    await u.click(within(dialog).getByRole("radio", { name: /Baleia/ }));
    await u.click(within(dialog).getByRole("button", { name: "Trocar mascote" }));

    expect(await screen.findByRole("button", { name: "Trocar o mascote (Baleia)" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("o polling traz a Mensagem que chegou", async () => {
    const s = setup({ pollMs: 50 });
    const inbox = await s.create("espera");
    s.renderScreen(inbox.id);
    expect(await screen.findByText("Esperando o primeiro email")).toBeInTheDocument();

    await act(async () => {
      await s.deliver(inbox.id, "e1", { subject: "Chegou agora" });
    });

    expect(await screen.findByRole("heading", { name: "Chegou agora" })).toBeInTheDocument();
  });

  it("escolher outra Mensagem abre a leitura dela; no celular, volta pra lista", async () => {
    const s = setup();
    const inbox = await s.create("duas");
    const now = s.inboxes.test.now().getTime();
    await s.deliver(inbox.id, "e1", { subject: "Antiga", receivedAt: new Date(now - 7_200_000) });
    await s.deliver(inbox.id, "e2", { subject: "Nova" });
    const { container } = s.renderScreen(inbox.id);
    const u = user();

    expect(await screen.findByRole("heading", { name: "Nova" })).toBeInTheDocument();
    const main = container.querySelector(".inbox-screen")!;
    expect(main).toHaveAttribute("data-pane", "messages");

    await u.click(screen.getByRole("button", { name: /Antiga/ }));
    expect(await screen.findByRole("heading", { name: "Antiga" })).toBeInTheDocument();
    expect(main).toHaveAttribute("data-pane", "reader");

    await u.click(screen.getByRole("button", { name: "‹ Mensagens" }));
    expect(main).toHaveAttribute("data-pane", "messages");
  });

  it("sem conexão, avisa e continua tentando", async () => {
    const s = setup({ pollMs: 50 });
    const inbox = await s.create("rede");
    s.renderScreen(inbox.id);
    expect(await screen.findByText("Atualizando a cada 5 s")).toBeInTheDocument();

    s.inboxes.failWith = { status: 0, code: "network", message: "", details: {} };
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();

    s.inboxes.failWith = null;
    expect(await screen.findByText("Atualizando a cada 5 s")).toBeInTheDocument();
  });

  it("sessão acabada avisa a página", async () => {
    const s = setup();
    const inbox = await s.create("fim");
    s.inboxes.failWith = { status: 401, code: "unauthenticated", message: "", details: {} };
    s.renderScreen(inbox.id);

    await waitFor(() => expect(s.onSessionEnded).toHaveBeenCalled());
  });
});
