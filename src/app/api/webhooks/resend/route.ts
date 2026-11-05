import { jsonNoStore } from "@/composition/http";
import {
  composeReceiveEmail,
  composeWebhookVerifier,
  debugLog,
  logEvent,
} from "@/composition/receiving";
import { parseReceivedEmailEvent } from "@/modules/message/infrastructure/parseReceivedEmailEvent";
import { missingReceivingEnv } from "@/shared/config/env";

/**
 * Webhook do Resend (`email.received`). A URL é pública, então a assinatura é
 * conferida sobre o corpo bruto antes de qualquer outra coisa.
 *
 * - `200`: processado, repetido (idempotente), descartado (Email órfão) ou de
 *   outro tipo de evento: o Resend não precisa reenviar.
 * - `400`: assinatura inválida ou aviso sem id/remetente.
 * - `503`: faltam variáveis, ou uma falha passageira (Resend, R2, banco): o
 *   Resend reenvia por cerca de 40 h, e o processamento é idempotente.
 */
export async function POST(request: Request) {
  const missing = missingReceivingEnv();
  if (missing.length > 0) {
    return jsonNoStore({ error: "receiving_not_configured", missing }, 503);
  }

  const payload = await request.text();

  let body: unknown;
  try {
    body = composeWebhookVerifier().verify(payload, request.headers);
  } catch (error) {
    // `SyntaxError`: a assinatura vale, mas o corpo não é JSON.
    if (error instanceof SyntaxError) {
      logEvent("webhook.invalid_payload");
      return jsonNoStore({ error: "invalid_payload" }, 400);
    }
    logEvent("webhook.invalid_signature");
    return jsonNoStore({ error: "invalid_signature" }, 400);
  }

  debugLog("webhook.payload", { payload: body });

  const type = (body as { type?: unknown } | null)?.type;
  if (type !== "email.received") {
    return jsonNoStore({ ignored: "event_type", type: typeof type === "string" ? type : null });
  }

  const event = parseReceivedEmailEvent(body);
  if (!event) {
    logEvent("webhook.invalid_payload");
    return jsonNoStore({ error: "invalid_payload" }, 400);
  }

  try {
    const outcome = await composeReceiveEmail().execute(event);
    return jsonNoStore({ outcome: outcome.kind });
  } catch (error) {
    logEvent("webhook.failed", {
      emailId: event.emailId,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return jsonNoStore({ error: "temporarily_unavailable" }, 503);
  }
}
