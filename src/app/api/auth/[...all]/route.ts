import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/modules/membership/infrastructure/auth";
import { missingAuthEnv } from "@/shared/config/env";

// O Better Auth é criado sob demanda (precisa de banco e segredos), então o
// handler também: assim o build não depende de nada disso.
function notConfigured(): Response | null {
  const missing = missingAuthEnv();
  if (missing.length === 0) return null;
  return Response.json({ error: "auth_not_configured", missing }, { status: 503 });
}

export async function GET(request: Request) {
  return notConfigured() ?? toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return notConfigured() ?? toNextJsHandler(getAuth()).POST(request);
}
