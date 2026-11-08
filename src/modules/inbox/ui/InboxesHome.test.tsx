import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FakeInboxGateway } from "../testing/FakeInboxGateway";
import { InboxesHome } from "./InboxesHome";

// Gateway falso que roda os casos de uso reais sobre repositórios em memória.
function setup(options: { pollMs?: number } = {}) {
  const inboxes = new FakeInboxGateway();
  const onOpenInbox = vi.fn();
  const onSessionEnded = vi.fn();
  const now = inboxes.test.now();
  const renderHome = () =>
    render(
      <InboxesHome
        inboxes={inboxes}
        mailDomain="tmp.exemplo.test"
        ttlHours={24}
        onOpenInbox={onOpenInbox}
        inboxHref={(id) => `/caixas/${id}`}
        onSessionEnded={onSessionEnded}
        pollMs={options.pollMs ?? 60_000}
        clock={() => now}
      />,
    );
  return { inboxes, onOpenInbox, onSessionEnded, renderHome };
}

const user = () => userEvent.setup();

async function created(s: ReturnType<typeof setup>, address: string, mascot?: "polvo" | "coruja") {
  const result = await s.inboxes.create({ address, mascot });
  if (!result.ok) throw new Error(result.error.message);
  return result.value.inbox;
}

describe("InboxesHome", () => {
  it("sem nenhuma Caixa, convida a criar a primeira", async () => {
    setup().renderHome();

    expect(await screen.findByText("Nenhuma caixa ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar a primeira caixa" })).toBeInTheDocument();
  });

  it("lista as Caixas com o mascote, o prazo e o link pra tela de cada uma", async () => {
    const s = setup();
    const inbox = await created(s, "cadastro", "polvo");
    s.renderHome();

    const list = await screen.findByRole("list", { name: "Suas caixas" });
    const link = within(list).getByRole("link", { name: /cadastro/ });
    expect(link).toHaveAttribute("href", `/caixas/${inbox.id}`);
    expect(within(link).getByText(/Expira em/)).toBeInTheDocument();
    expect(within(list).getByText("Polvo", { selector: ".mascot-tag" })).toBeInTheDocument();
  });

  it("cria uma Caixa com nome, mantida e com o mascote escolhido, e a abre", async () => {
    const s = setup();
    s.renderHome();
    const u = user();

    await u.click(await screen.findByRole("button", { name: /Nova caixa/ }));
    const dialog = screen.getByRole("dialog", { name: "Nova caixa" });
    await u.click(within(dialog).getByRole("radio", { name: "Escolher nome" }));
    await u.type(within(dialog).getByLabelText("Nome do endereço"), "teste-pix");
    expect(await within(dialog).findByText(/Disponível/)).toBeInTheDocument();
    await u.click(within(dialog).getByRole("radio", { name: /Coruja/ }));
    expect(within(dialog).getByRole("radio", { name: /Coruja/ })).toHaveAttribute("aria-checked", "true");
    await u.click(within(dialog).getByRole("checkbox", { name: /Manter/ }));
    await u.click(within(dialog).getByRole("button", { name: "Criar caixa" }));

    await waitFor(() => expect(s.onOpenInbox).toHaveBeenCalled());
    const listed = await s.inboxes.list();
    if (!listed.ok) throw new Error();
    const [view] = listed.value;
    expect(view).toMatchObject({ address: "teste-pix", mascot: "coruja", kept: true });
    expect(s.onOpenInbox).toHaveBeenCalledWith(view.id);
  });

  it("valida o nome enquanto digita e recusa o de outro Membro", async () => {
    const s = setup();
    await s.inboxes.seedForOtherMember("qa-login");
    s.renderHome();
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
  });

  it("pelo menu, mantém e apaga (com confirmação); a expirada ganha Reativar", async () => {
    const s = setup();
    await created(s, "ciclo");
    s.renderHome();
    const u = user();

    await u.click(await screen.findByRole("button", { name: "Mais ações para ciclo" }));
    await u.click(screen.getByRole("menuitem", { name: "Manter (sem prazo)" }));
    expect(await screen.findByText("ciclo mantida, sem prazo.")).toBeInTheDocument();
    expect(screen.getByText("Mantida, sem prazo")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Mais ações para ciclo" }));
    await u.click(screen.getByRole("menuitem", { name: "Apagar" }));
    const confirm = screen.getByRole("group", { name: "Apagar ciclo" });
    await u.click(within(confirm).getByRole("button", { name: "Apagar" }));
    expect(await screen.findByText("ciclo apagada.")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Reativar" }));
    expect(await screen.findByText("ciclo reativada por 24 h.")).toBeInTheDocument();
    expect(screen.getByText(/Expira em/)).toBeInTheDocument();
  });

  it("troca o mascote pelo menu", async () => {
    const s = setup();
    await created(s, "bicho", "polvo");
    s.renderHome();
    const u = user();

    await u.click(await screen.findByRole("button", { name: "Mais ações para bicho" }));
    await u.click(screen.getByRole("menuitem", { name: "Trocar mascote" }));
    const dialog = screen.getByRole("dialog", { name: /Mascote de/ });
    const save = within(dialog).getByRole("button", { name: "Trocar mascote" });
    expect(save).toBeDisabled();
    await u.click(within(dialog).getByRole("radio", { name: /Coruja/ }));
    await u.click(save);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Coruja", { selector: ".mascot-tag" })).toBeInTheDocument();
    expect(s.inboxes.calls).toContain("setMascot");
  });

  it("mostra o erro de negócio ao reativar passando do limite", async () => {
    const s = setup();
    const old = await created(s, "velha");
    await s.inboxes.remove(old.id);
    for (let i = 0; i < 20; i++) await s.inboxes.create({});
    s.renderHome();
    const u = user();

    await u.click(await screen.findByRole("button", { name: "Reativar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Você já tem 20 Caixas ativas");
  });

  it("sessão acabada avisa a página", async () => {
    const s = setup();
    s.inboxes.failWith = { status: 403, code: "access_ended", message: "", details: {} };
    s.renderHome();

    await waitFor(() => expect(s.onSessionEnded).toHaveBeenCalledWith("revoked"));
  });

  it("o polling traz a Caixa criada por fora (API ou MCP)", async () => {
    const s = setup({ pollMs: 50 });
    s.renderHome();
    expect(await screen.findByText("Nenhuma caixa ainda")).toBeInTheDocument();

    await created(s, "via-mcp");

    expect(await screen.findByRole("link", { name: /via-mcp/ })).toBeInTheDocument();
  });
});
