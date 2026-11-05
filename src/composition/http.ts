import { describeInboxError, type InboxError } from "@/modules/inbox/application/InboxError";

/** Resposta JSON sem cache: o conteúdo é de um Membro e muda o tempo todo. */
export function jsonNoStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function badRequest(message: string): Response {
  return jsonNoStore({ error: "invalid_body", message }, 400);
}

const STATUS_BY_ERROR: Record<InboxError["code"], number> = {
  invalid_address: 400,
  address_taken: 409,
  already_active: 409,
  limit_reached: 409,
  not_found: 404,
  not_active: 409,
  not_expired: 409,
};

export function inboxErrorResponse(error: InboxError): Response {
  return jsonNoStore(
    {
      error: error.code,
      message: describeInboxError(error),
      ...(error.code === "limit_reached" ? { max: error.max } : {}),
      ...(error.code === "invalid_address" ? { problem: error.problem } : {}),
    },
    STATUS_BY_ERROR[error.code],
  );
}

type JsonBody = { ok: true; body: Record<string, unknown> } | { ok: false; response: Response };

/**
 * Lê o corpo como um objeto JSON. Com corpo, exige `Content-Type:
 * application/json`: um formulário de outro site não consegue enviar isso sem
 * passar pelo CORS, e os cookies já são SameSite=Lax.
 */
export async function readJsonObject(
  request: Request,
  options: { allowEmpty: boolean },
): Promise<JsonBody> {
  const text = await request.text();

  if (text.trim() === "") {
    return options.allowEmpty
      ? { ok: true, body: {} }
      : { ok: false, response: badRequest("O corpo da requisição é obrigatório.") };
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: "unsupported_media_type", message: "Envie o corpo como application/json." },
        415,
      ),
    };
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, response: badRequest("O corpo precisa ser um objeto JSON.") };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: badRequest("O corpo não é um JSON válido.") };
  }
}
