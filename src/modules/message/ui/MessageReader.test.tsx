import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageDetailView } from "../application/MessageView";
import { MessageList, senderName } from "./MessageList";
import { MessageReader, sandboxedDocument } from "./MessageReader";

const now = new Date("2026-11-05T12:00:00Z");

function detail(overrides: Partial<MessageDetailView> = {}): MessageDetailView {
  return {
    id: "m1",
    inboxId: "i1",
    from: "GitHub <noreply@github.com>",
    fromAddress: "noreply@github.com",
    subject: "Seu código de verificação",
    receivedAt: "2026-11-05T11:59:00Z",
    verificationCode: "482913",
    status: "ready",
    attachmentCount: 0,
    text: "Use o código 482913.",
    html: '<p>Use o código <b>482913</b>.</p><script>alert(1)</script>',
    messageId: null,
    attachments: [],
    hasRaw: true,
    ...overrides,
  };
}

function renderReader(message: MessageDetailView, loadHeaders = vi.fn(async () => [{ name: "From", value: "a@b.test" }])) {
  render(
    <MessageReader
      message={message}
      inboxAddress="teste@tmp.exemplo.test"
      now={now}
      rawUrl="/api/messages/m1/raw"
      attachmentUrl={(i) => `/api/messages/m1/attachments/${i}`}
      loadHeaders={loadHeaders}
      onBack={() => {}}
    />,
  );
  return { loadHeaders };
}

describe("MessageReader", () => {
  it("mostra o código em destaque e copia", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderReader(detail());

    await userEvent.click(screen.getByRole("button", { name: /Copiar código/ }));

    expect(writeText).toHaveBeenCalledWith("482913");
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
  });

  it("põe o HTML num iframe com sandbox, sem scripts nem a origem do app", () => {
    renderReader(detail());

    const frame = screen.getByTitle("Conteúdo do email");
    expect(frame.getAttribute("sandbox")).toBe("allow-popups allow-popups-to-escape-sandbox");
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-scripts|allow-same-origin/);
    expect(frame.getAttribute("srcdoc")).toContain("Content-Security-Policy");
  });

  it("troca para o texto e carrega os cabeçalhos só quando pedidos", async () => {
    const { loadHeaders } = renderReader(detail());
    const u = userEvent.setup();
    expect(loadHeaders).not.toHaveBeenCalled();

    await u.click(screen.getByRole("tab", { name: "Texto" }));
    expect(screen.getByText("Use o código 482913.")).toBeInTheDocument();

    await u.click(screen.getByRole("tab", { name: "Cabeçalhos" }));
    expect(await screen.findByText("a@b.test")).toBeInTheDocument();
    expect(loadHeaders).toHaveBeenCalledOnce();
  });

  it("sem HTML, abre direto no texto (convertendo nada) e oferece o .eml", () => {
    renderReader(detail({ html: null }));

    expect(screen.queryByRole("tab", { name: "HTML" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Texto" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "Baixar .eml" })).toHaveAttribute("href", "/api/messages/m1/raw");
  });

  it("anexos viram links de download, com o tamanho", () => {
    renderReader(
      detail({
        attachments: [
          { id: "a1", filename: "nota-fiscal-1042.pdf", contentType: "application/pdf", contentDisposition: "attachment", contentId: null, size: 12_400 },
        ],
      }),
    );

    const link = screen.getByRole("link", { name: /nota-fiscal-1042.pdf/ });
    expect(link).toHaveAttribute("href", "/api/messages/m1/attachments/0");
    expect(link).toHaveTextContent("12 KB");
  });

  it("conteúdo indisponível por cota: explica, sem abas nem downloads", () => {
    renderReader(
      detail({
        status: "quota_exceeded",
        text: null,
        html: null,
        verificationCode: null,
        hasRaw: false,
        attachments: [
          { id: "a1", filename: "nota.pdf", contentType: null, contentDisposition: null, contentId: null, size: null },
        ],
      }),
    );

    expect(screen.getByText("Conteúdo indisponível")).toBeInTheDocument();
    expect(screen.getByText(/cota do provedor/)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("nota.pdf")).toBeInTheDocument();
  });
});

describe("sandboxedDocument", () => {
  it("bloqueia scripts e faz os links abrirem fora", () => {
    const doc = sandboxedDocument("<a href='https://x.test'>x</a>");

    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toContain("script-src");
    expect(doc).toContain('<base target="_blank">');
  });
});

describe("MessageList", () => {
  it("mostra o nome do remetente, o assunto e o código", () => {
    render(
      <MessageList
        messages={[detail()]}
        selectedId="m1"
        now={now}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /GitHub.*Seu código de verificação.*código 482913/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByText("há 1 min")).toBeInTheDocument();
  });

  it("senderName tira o endereço quando há nome", () => {
    expect(senderName("GitHub <noreply@github.com>")).toBe("GitHub");
    expect(senderName('"Mateus Silva" <m@x.test>')).toBe("Mateus Silva");
    expect(senderName("noreply@github.com")).toBe("noreply@github.com");
  });
});
