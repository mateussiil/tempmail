"use client";

import { useState } from "react";
import { composeBrowserGateways, leaveEndedSession } from "@/composition/browser";
import { InboxScreen } from "@/modules/inbox/ui/InboxScreen";

/** Liga a tela de uma Caixa aos gateways HTTP. */
export function InboxScreenEntry({ inboxId, ttlHours }: { inboxId: string; ttlHours: number }) {
  const [gateways] = useState(() => composeBrowserGateways());
  return (
    <InboxScreen
      inboxId={inboxId}
      inboxes={gateways.inboxes}
      messages={gateways.messages}
      ttlHours={ttlHours}
      homeHref="/"
      onSessionEnded={leaveEndedSession}
    />
  );
}
