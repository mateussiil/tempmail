import { Webhook } from "svix";

/**
 * Confere a assinatura de um webhook do Resend (que usa o Svix) sobre o corpo
 * **bruto**: reserializar o JSON quebra a assinatura. Lança se a assinatura é
 * inválida, se faltam cabeçalhos ou se o timestamp está fora da tolerância
 * (5 minutos), o que também barra o replay de um aviso antigo.
 */
export class SvixWebhookVerifier {
  private readonly webhook: Webhook;

  constructor(secret: string) {
    this.webhook = new Webhook(secret);
  }

  /**
   * Devolve o JSON do aviso, já com a assinatura conferida. Lança o erro do
   * Svix se a assinatura não vale, ou `SyntaxError` se ela vale mas o corpo
   * não é JSON.
   */
  verify(payload: string, headers: Headers): unknown {
    // O `verify` do Svix 2.x não devolve nada (ao contrário de versões antigas
    // e da documentação do Resend): só lança quando a assinatura é inválida.
    this.webhook.verify(payload, {
      "svix-id": headers.get("svix-id") ?? "",
      "svix-timestamp": headers.get("svix-timestamp") ?? "",
      "svix-signature": headers.get("svix-signature") ?? "",
    });
    return JSON.parse(payload);
  }
}
