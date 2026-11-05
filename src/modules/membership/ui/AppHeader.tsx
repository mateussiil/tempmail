import Link from "next/link";
import type { ReactNode } from "react";
import { MailIcon } from "@/shared/ui/icons";

type AppHeaderProps = {
  githubUsername: string;
  current: "inboxes" | "keys";
  /** O botão de sair (componente de cliente) entra aqui. */
  actions: ReactNode;
};

/** O topo de todas as telas do Membro: marca, navegação, quem está logado e Sair. */
export function AppHeader({ githubUsername, current, actions }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link href="/" className="brand" aria-label="tempmail, início">
        <MailIcon />
        <span>tempmail</span>
      </Link>
      <nav aria-label="Principal" className="app-nav">
        <Link href="/" aria-current={current === "inboxes" ? "page" : undefined}>
          Caixas
        </Link>
        <Link href="/chaves" aria-current={current === "keys" ? "page" : undefined}>
          Chaves de API
        </Link>
      </nav>
      <span className="spacer" />
      <span className="muted small member-name">@{githubUsername}</span>
      {actions}
    </header>
  );
}
