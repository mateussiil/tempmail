import Link from "next/link";
import type { ReactNode } from "react";
import { HermesFlying } from "./HermesFlying";

type AppShellProps = {
  githubUsername: string;
  current: "inboxes" | "keys";
  /** Quantas Caixas ativas, para o selo ao lado de "Caixas". */
  activeInboxes?: number;
  /** O botão de sair (componente de cliente). */
  signOut: ReactNode;
  children: ReactNode;
};

/** A marca: três faixas de velocidade, como um envelope que voa. */
export function BrandMark() {
  return (
    <svg className="brand-mark" width="40" height="28" viewBox="0 0 40 28" aria-hidden="true">
      <path d="M2 2h36l-5.5 6H2z" />
      <path d="M9 11h22l-5.5 6H9z" />
      <path d="M16 20h9l-5.5 6H16z" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.2 11.8L20 3m-3.5 3.5L19 9m-5-1.5L16.5 10" />
    </svg>
  );
}

/**
 * A casca das telas do Membro: no computador, a barra lateral com a marca, a
 * navegação, quem está logado e o Hermes no pé; no celular, um topo compacto.
 */
export function AppShell({ githubUsername, current, activeInboxes, signOut, children }: AppShellProps) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="tempmail, suas caixas">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">tempmail</span>
            <span className="brand-sub">Email temporário · API · MCP</span>
          </span>
        </Link>

        <nav aria-label="Principal" className="side-nav">
          <Link href="/" aria-current={current === "inboxes" ? "page" : undefined}>
            <InboxIcon />
            <span>Caixas</span>
            {activeInboxes ? <span className="nav-count" aria-label={`${activeInboxes} ativas`}>{activeInboxes}</span> : null}
          </Link>
          <Link href="/chaves" aria-current={current === "keys" ? "page" : undefined}>
            <KeyIcon />
            <span>Chaves de API</span>
          </Link>
        </nav>

        <div className="side-account">
          <span className="account-name">@{githubUsername}</span>
          {signOut}
        </div>

        <HermesFlying className="side-hermes" />
      </aside>

      <div className="shell-main">{children}</div>
    </div>
  );
}
