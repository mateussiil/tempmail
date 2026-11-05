"use client";

import { useState } from "react";
import { composeBrowserGateways, leaveEndedSession } from "@/composition/browser";
import { ApiKeysScreen } from "@/modules/membership/ui/ApiKeysScreen";

/** Liga a tela de Chaves de API ao gateway HTTP (no navegador). */
export function ApiKeysEntry({ mcpUrl }: { mcpUrl: string }) {
  const [gateways] = useState(() => composeBrowserGateways());
  return <ApiKeysScreen gateway={gateways.apiKeys} mcpUrl={mcpUrl} onSessionEnded={leaveEndedSession} />;
}
