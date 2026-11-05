// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sampleEml } from "../testing/sampleEml";
import { MailparserEmailParser } from "./MailparserEmailParser";

describe("MailparserEmailParser", () => {
  it("devolve os cabeçalhos na ordem, com as linhas dobradas juntadas", async () => {
    const { headers } = await new MailparserEmailParser().parse(sampleEml());

    expect(headers.slice(0, 3)).toEqual([
      { name: "From", value: "Loja Exemplo <pedidos@loja.exemplo>" },
      { name: "To", value: "teste@tmp.exemplo.test" },
      { name: "Subject", value: "Pedido 1042 confirmado" },
    ]);
    expect(headers).toContainEqual({ name: "X-Teste", value: "uma linha dobrada" });
  });

  it("extrai o anexo com nome, tipo e bytes", async () => {
    const { attachments } = await new MailparserEmailParser().parse(sampleEml());

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ filename: "nota-fiscal-1042.pdf", contentType: "application/pdf" });
    expect(new TextDecoder().decode(attachments[0].content)).toBe("%PDF-1.4 nota fiscal de teste");
  });
});
