// @vitest-environment node
import { Webhook } from "svix";
import { describe, expect, it } from "vitest";
import { SvixWebhookVerifier } from "./SvixWebhookVerifier";

const SECRET = `whsec_${Buffer.from("segredo-de-teste-com-32-bytes!!").toString("base64")}`;
const payload = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });

/** Assina como o Resend faz, para o `now` dado. */
function signedHeaders(body: string, options: { secret?: string; at?: Date; id?: string } = {}) {
  const id = options.id ?? "msg_123";
  const at = options.at ?? new Date();
  const signature = new Webhook(options.secret ?? SECRET).sign(id, at, body);
  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
    "svix-signature": signature,
  });
}

describe("SvixWebhookVerifier", () => {
  const verifier = new SvixWebhookVerifier(SECRET);

  it("aceita um aviso assinado e devolve o JSON interpretado", () => {
    expect(verifier.verify(payload, signedHeaders(payload))).toEqual({
      type: "email.received",
      data: { email_id: "e1" },
    });
  });

  it("recusa assinatura feita com outro segredo", () => {
    const other = `whsec_${Buffer.from("outro-segredo-com-32-bytes-aaaa!").toString("base64")}`;

    expect(() => verifier.verify(payload, signedHeaders(payload, { secret: other }))).toThrow();
  });

  it("recusa o corpo alterado depois de assinado", () => {
    const headers = signedHeaders(payload);
    const tampered = payload.replace("e1", "e2");

    expect(() => verifier.verify(tampered, headers)).toThrow();
  });

  it("recusa o corpo reserializado (a assinatura vale para o texto exato)", () => {
    const headers = signedHeaders(payload);
    const reserialized = JSON.stringify(JSON.parse(payload), null, 2);

    expect(() => verifier.verify(reserialized, headers)).toThrow();
  });

  it("recusa um aviso antigo (replay), com timestamp fora da tolerância", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    expect(() => verifier.verify(payload, signedHeaders(payload, { at: tenMinutesAgo }))).toThrow();
  });

  it("recusa quando faltam cabeçalhos", () => {
    expect(() => verifier.verify(payload, new Headers())).toThrow();
    const headers = signedHeaders(payload);
    headers.delete("svix-signature");
    expect(() => verifier.verify(payload, headers)).toThrow();
  });

  it("assinatura válida com corpo que não é JSON lança SyntaxError (e não 'assinatura inválida')", () => {
    const notJson = "isto não é json";

    expect(() => verifier.verify(notJson, signedHeaders(notJson))).toThrow(SyntaxError);
  });

  it("recusa assinatura inventada", () => {
    const headers = signedHeaders(payload);
    headers.set("svix-signature", "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");

    expect(() => verifier.verify(payload, headers)).toThrow();
  });
});
