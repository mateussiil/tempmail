import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InboxRepositoryDirectory } from "@/composition/inboxDirectory";
import { Message } from "@/modules/message/domain/Message";
import { FakeMessageGateway } from "@/modules/message/testing/FakeMessageGateway";
import { FakeInboxGateway } from "../testing/FakeInboxGateway";
import { InboxWorkspace } from "./InboxWorkspace";

// O ponto de entrada é testado com gateways falsos que rodam os casos de uso
// reais sobre repositórios em memória: sem HTTP, sem servidor.
function setup(options: { pollMs?: number } = {}) {
  const inboxes = new FakeInboxGateway();
  const directory = new InboxRepositoryDirectory(inboxes.test.repository, inboxes.test.deps.clock);
  const messages = new FakeMessageGateway(directory);
  const onSessionEnded = vi.fn();
  const now = inboxes.test.now();

  const deliver = async (inboxId: string, emailId: string, overrides: Partial<Parameters<typeof Message.ready>[0]> = {}) => {
    const message = Message.ready({
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
    });
    await messages.repository.insert(message);
    return message;
  };

  const renderWorkspace = () =>
    render(
      <InboxWorkspace
        inboxes={inboxes}
        messages={messages}
        mailDomain="tmp.exemplo.test"
        ttlHours={24}
        onSessionEnded={onSessionEnded}
        pollMs={options.pollMs ?? 60_000}
        clock={() => now}
      />,
    );

  return { inboxes, messages, deliver, onSessionEnded, renderWorkspace };
}

const user = () => userEvent.setup();

afterEach(() => {
  vi.useRealTimers();
});

describe("InboxWorkspace", () => {
  it("abre a primeira Caixa ativa com a Mensagem mais recente e o código em destaque", async () => {
    const s = setup();
    const created = await s.inboxes.create({ address: "cadastro" });
    if (!created.ok) throw new Error();
    await s.deliver(created.value.inbox.id, "e1");

    s.renderWorkspace();

    const nav = await screen.findByRole("navigation", { name: "Suas caixas" });
    expect(within(nav).getByRole("button", { name: /cadastro/ })).toHaveAttribute("aria-current", "true");
    expect(await screen.findByText("cadastro@tmp.exemplo.test")).toBeInTheDocument();
    expect(await screen.findByText("482913", { selector: ".code-card-value" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar código/ })).toBeInTheDocument();
    expect(screen.getByText("código 482913")).toBeInTheDocument();
  });

  it("Caixa sem Mensagens mostra a espera, com o endereço pra copiar", async () => {
    const s = setup();
    await s.inboxes.create({ address: "vazia" });

    s.renderWorkspace();

    const waiting = (await screen.findByText("Esperando o primeiro email")).closest(".empty-state") as HTMLElement;
    expect(within(waiting).getByRole("button", { name: /Copiar endereço/ })).toBeInTheDocument();
  });

  it("sem nenhuma Caixa, convida a criar a primeira", async () => {
    setup().renderWorkspace();

    expect(await screen.findByText("Nenhuma caixa ainda")).toBeInTheDocument();
  });

  it("cria uma Caixa aleatória já mantida e a abre", async () => {
    const s = setup();
    s.renderWorkspace();
    const u = user();

    await u.click(await screen.findByRole("button", { name: /Nova caixa/ }));
    const dialog = screen.getByRole("dialog", { name: "Nova caixa" });
    await u.click(within(dialog).getByRole("checkbox", { name: /Manter/ }));
    await u.click(within(dialog).getByRole("button", { name: "Criar caixa" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("aleatoria1@tmp.exemplo.test")).toBeInTheDocument();
    expect(screen.getByText("Mantida, sem prazo")).toBeInTheDocument();
    expect(s.inboxes.calls).toContain("setKept");
  });

  it("valida o nome enquanto digita: formato, de outro Membro e livre", async () => {
    const s = setup();
    await s.inboxes.seedForOtherMember("qa-login");
    s.renderWorkspace();
    const u = user();

    await u.click(await screen.findByRole("button", { name: /Nova caixa/ }));
    await u.click(screen.getByRole("radio", { name: "Escolher nome" }));
    const input = screen.getByLabelText("Nome do endereço");
    const create = screen.getByRole("button", { name: "Criar caixa" });

    await u.type(input, "-x");
    expect(screen.getByText(/de 3 a 40 caracteres/)).toBeInTheDocument();
    expect(create).toBeDisabled();

    await u.clear(input);
    await u.type(input, "qa-login");
    expect(await screen.findByText(/pertence a outro membro/)).toBeInTheDocument();
    expect(create).toBeDisabled();

    await u.clear(input);
    await u.type(input, "Teste-Pix");
    expect(await screen.findByText(/Disponível/)).toBeInTheDocument();
    await u.click(create);

    expect(await screen.findByText("teste-pix@tmp.exemplo.test")).toBeInTheDocument();
  });

  it("um endereço seu expirado vira Reativar", async () => {
    const s = setup();
    const created = await s.inboxes.create({ address: "stripe-teste" });
    if (!created.ok) throw new Error();
    await s.inboxes.remove(created.value.inbox.id);
    s.renderWorkspace();
    const u = user();

    await u.click(await screen.findByRole("button", { name: /Nova caixa/ }));
    await u.click(screen.getByRole("radio", { name: "Escolher nome" }));
    await u.type(screen.getByLabelText("Nome do endereço"), "stripe-teste");

    expect(await screen.findByText(/Criar vai reativá-lo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reativar caixa" })).toBeEnabled();
  });

  it("mantém, apaga com confirmação e reativa a Caixa", async () => {
    const s = setup();
    await s.inboxes.create({ address: "ciclo" });
    s.renderWorkspace();
    const u = user();

    await u.click(await screen.findByRole("checkbox", { name: "Manter" }));
    expect(await screen.findByText("Mantida, sem prazo")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Apagar" }));
    await u.click(screen.getByRole("button", { name: "Sim, apagar" }));

    expect(await screen.findByText(/As mensagens foram apagadas/)).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Suas caixas" });
    expect(within(nav).getByRole("heading", { name: "Expiradas" })).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Reativar por 24 h" }));
    expect(await screen.findByText("Esperando o primeiro email")).toBeInTheDocument();
  });

  it("mostra o erro de negócio ao reativar passando do limite", async () => {
    const s = setup();
    const created = await s.inboxes.create({ address: "velha" });
    if (!created.ok) throw new Error();
    await s.inboxes.remove(created.value.inbox.id);
    for (let i = 0; i < 20; i++) await s.inboxes.create({});
    s.renderWorkspace();
    const u = user();

    await u.click(await screen.findByRole("button", { name: /velha/ }));
    await u.click(screen.getByRole("button", { name: "Reativar por 24 h" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Você já tem 20 Caixas ativas");
  });

  it("o polling traz a Mensagem que chegou e a mostra", async () => {
    const s = setup({ pollMs: 50 });
    const created = await s.inboxes.create({ address: "espera" });
    if (!created.ok) throw new Error();
    s.renderWorkspace();
    expect(await screen.findByText("Esperando o primeiro email")).toBeInTheDocument();

    await act(async () => {
      await s.deliver(created.value.inbox.id, "e1", { subject: "Chegou agora" });
    });

    expect(await screen.findByRole("heading", { name: "Chegou agora" })).toBeInTheDocument();
  });

  it("escolher outra Mensagem abre a leitura dela", async () => {
    const s = setup();
    const created = await s.inboxes.create({ address: "duas" });
    if (!created.ok) throw new Error();
    const now = s.inboxes.test.now().getTime();
    await s.deliver(created.value.inbox.id, "e1", { subject: "Antiga", receivedAt: new Date(now - 7_200_000) });
    await s.deliver(created.value.inbox.id, "e2", { subject: "Nova" });
    s.renderWorkspace();
    const u = user();

    expect(await screen.findByRole("heading", { name: "Nova" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /Antiga/ }));

    expect(await screen.findByRole("heading", { name: "Antiga" })).toBeInTheDocument();
  });

  it("sessão acabada ou acesso encerrado avisa a página", async () => {
    const s = setup();
    s.inboxes.failWith = { status: 403, code: "access_ended", message: "", details: {} };

    s.renderWorkspace();

    await waitFor(() => expect(s.onSessionEnded).toHaveBeenCalledWith("revoked"));
  });

  it("sem conexão, avisa e continua tentando", async () => {
    const s = setup({ pollMs: 50 });
    await s.inboxes.create({ address: "rede" });
    s.renderWorkspace();
    expect(await screen.findByText("Atualizando a cada 5 s")).toBeInTheDocument();

    s.inboxes.failWith = { status: 0, code: "network", message: "", details: {} };
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();

    s.inboxes.failWith = null;
    expect(await screen.findByText("Atualizando a cada 5 s")).toBeInTheDocument();
  });

  it("no celular, navega lista → Caixa → Mensagem e volta", async () => {
    const s = setup();
    const created = await s.inboxes.create({ address: "celular" });
    if (!created.ok) throw new Error();
    await s.deliver(created.value.inbox.id, "e1");
    const { container } = s.renderWorkspace();
    const workspace = container.querySelector(".workspace")!;
    const u = user();

    expect(workspace).toHaveAttribute("data-pane", "inboxes");
    await u.click(await screen.findByRole("button", { name: /celular/ }));
    expect(workspace).toHaveAttribute("data-pane", "messages");
    await u.click(await screen.findByRole("button", { name: /Seu código de verificação/ }));
    expect(workspace).toHaveAttribute("data-pane", "reader");
    await u.click(screen.getByRole("button", { name: "‹ Mensagens" }));
    expect(workspace).toHaveAttribute("data-pane", "messages");
  });
});
