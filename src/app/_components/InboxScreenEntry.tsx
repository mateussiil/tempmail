"use client";

import { useState } from "react";
import { composeBrowserGateways, leaveEndedSession } from "@/composition/browser";
import { InboxScreen } from "@/modules/inbox/ui/InboxScreen";

/** Liga a tela de uma Caixa aos gateways HTTP. */
export function InboxScreenEntry({
  inboxId,
  ttlHours,
  initialMessageId,
}: {
  inboxId: string;
  ttlHours: number;
  initialMessageId?: string;
}) {
  const [gateways] = useState(() => composeBrowserGateways());
  return (
    <InboxScreen
      inboxId={inboxId}
      inboxes={gateways.inboxes}
      messages={gateways.messages}
      ttlHours={ttlHours}
      initialMessageId={initialMessageId}
      homeHref="/"
      onSessionEnded={leaveEndedSession}
    />
  );
}
