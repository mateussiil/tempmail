import { describe, expect, it } from "vitest";
import {
  pickRecipientAddresses,
  splitAddress,
  type ReceivedEmailEvent,
} from "./ReceivedEmailEvent";

const DOMAIN = "tmp.exemplo.test";

function event(overrides: Partial<ReceivedEmailEvent> = {}): ReceivedEmailEvent {
  return {
    emailId: "email-1",
    from: "noreply@github.com",
    to: [],
    cc: [],
    bcc: [],
    receivedFor: [],
    subject: "Oi",
    messageId: null,
    receivedAt: null,
    attachments: [],
    ...overrides,
  };
}

describe("splitAddress", () => {
  it("separa a parte local e o domínio, em minúsculas", () => {
    expect(splitAddress("Teste@TMP.Exemplo.test")).toEqual({
      local: "teste",
      domain: "tmp.exemplo.test",
    });
  });

  it("aceita o formato com nome", () => {
    expect(splitAddress('"Fulana de Tal" <fulana@tmp.exemplo.test>')).toEqual({
      local: "fulana",
      domain: "tmp.exemplo.test",
    });
  });

  it("recusa o que não é um endereço", () => {
    for (const bad of ["", "sem-arroba", "@dominio.test", "local@"]) {
      expect(splitAddress(bad)).toBeNull();
    }
  });
});

describe("pickRecipientAddresses", () => {
  it("pega os endereços do nosso domínio em `to`", () => {
    const result = pickRecipientAddresses(
      event({ to: ["teste@tmp.exemplo.test", "alguem@outro.test"] }),
      DOMAIN,
    );

    expect(result).toEqual(["teste"]);
  });

  it("prefere `received_for` (o destinatário do envelope) quando vem preenchido", () => {
    const result = pickRecipientAddresses(
      event({
        receivedFor: ["teste@tmp.exemplo.test"],
        to: ["alguem@outro.test", "outra@tmp.exemplo.test"],
      }),
      DOMAIN,
    );

    expect(result).toEqual(["teste"]);
  });

  it("sem `received_for`, usa to, cc e bcc", () => {
    const result = pickRecipientAddresses(
      event({
        to: ["a-caixa@tmp.exemplo.test"],
        cc: ["b-caixa@tmp.exemplo.test"],
        bcc: ["c-caixa@tmp.exemplo.test"],
      }),
      DOMAIN,
    );

    expect(result).toEqual(["a-caixa", "b-caixa", "c-caixa"]);
  });

  it("não repete endereço e ignora maiúsculas e o formato com nome", () => {
    const result = pickRecipientAddresses(
      event({ to: ["Teste <TESTE@tmp.exemplo.test>", "teste@tmp.exemplo.test"] }),
      DOMAIN,
    );

    expect(result).toEqual(["teste"]);
  });

  it("não aceita outro domínio nem subdomínio parecido", () => {
    const result = pickRecipientAddresses(
      event({
        to: ["teste@exemplo.test", "teste@tmp.exemplo.test.mal.test", "teste@x.tmp.exemplo.test"],
      }),
      DOMAIN,
    );

    expect(result).toEqual([]);
  });

  it("devolve vazio quando nada é do nosso domínio", () => {
    expect(pickRecipientAddresses(event({ to: ["a@outro.test"] }), DOMAIN)).toEqual([]);
    expect(pickRecipientAddresses(event(), DOMAIN)).toEqual([]);
  });
});
