"use client";

import { useState } from "react";
import { composeBrowserGateways, leaveEndedSession } from "@/composition/browser";
import { InboxWorkspace } from "@/modules/inbox/ui/InboxWorkspace";

/** Liga a tela de Caixas aos gateways HTTP (no navegador). */
export function InboxWorkspaceEntry({ mailDomain, ttlHours }: { mailDomain: string; ttlHours: number }) {
  const [gateways] = useState(() => composeBrowserGateways());
  return (
    <InboxWorkspace
      inboxes={gateways.inboxes}
      messages={gateways.messages}
      mailDomain={mailDomain}
      ttlHours={ttlHours}
      onSessionEnded={leaveEndedSession}
    />
  );
}
