"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { composeBrowserGateways, leaveEndedSession } from "@/composition/browser";
import { InboxesHome } from "@/modules/inbox/ui/InboxesHome";

const inboxHref = (inboxId: string) => `/caixas/${encodeURIComponent(inboxId)}`;

/** Liga a home ("Suas caixas") ao gateway HTTP e às rotas do app. */
export function InboxesHomeEntry({ mailDomain, ttlHours }: { mailDomain: string; ttlHours: number }) {
  const [gateways] = useState(() => composeBrowserGateways());
  const router = useRouter();
  return (
    <InboxesHome
      inboxes={gateways.inboxes}
      mailDomain={mailDomain}
      ttlHours={ttlHours}
      inboxHref={inboxHref}
      onOpenInbox={(id) => router.push(inboxHref(id))}
      onSessionEnded={leaveEndedSession}
    />
  );
}
