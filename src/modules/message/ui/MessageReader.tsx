"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/shared/ui/CopyButton";
import { formatBytes, timeAgo } from "@/shared/ui/format";
import { htmlToText } from "../domain/htmlToText";
import type { MessageDetailView } from "../application/MessageView";
import type { EmailHeader } from "../application/ports";

type Tab = "html" | "text" | "headers";

type MessageReaderProps = {
  message: MessageDetailView;
  inboxAddress: string;
  now: Date;
  rawUrl: string;
  attachmentUrl: (index: number) => string;
  /** Busca os cabeçalhos do email original; `null` se não deu. */
  loadHeaders: () => Promise<EmailHeader[] | null>;
  /** Só aparece no celular: volta para a lista de Mensagens. */
  onBack: () => void;
};

/**
 * O HTML do email é de terceiros: vai num iframe com `sandbox` sem
 * `allow-scripts` nem `allow-same-origin` (não roda nada e não enxerga o app)
 * e com uma CSP que só deixa carregar imagens e estilos. Links abrem em nova aba.
 */
export function sandboxedDocument(html: string): string {
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline' https:; font-src https: data:\">",
    "<base target=\"_blank\">",
    "<style>body{margin:16px;font-family:system-ui,sans-serif;color:#15181d;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>",
    "</head><body>",
    html,
    "</body></html>",
  ].join("");
}

function VerificationCode({ code }: { code: string }) {
  return (
    <div className="code-card">
      <div className="code-card-text">
        <span className="eyebrow code-card-label">Código de verificação</span>
        <span className="code-card-value mono">{code}</span>
      </div>
      <CopyButton text={code}>Copiar código</CopyButton>
    </div>
  );
}

function Unavailable({ status }: { status: MessageDetailView["status"] }) {
  return (
    <div className="notice notice-warn" role="note">
      <strong>Conteúdo indisponível</strong>
      <p>
        {status === "quota_exceeded"
          ? "Este email chegou quando a cota do provedor de email estava estourada, e o conteúdo se perdeu. Só ficaram o remetente, o assunto e os nomes dos anexos."
          : "Este email passou do tamanho máximo, então só guardamos o remetente, o assunto e os nomes dos anexos."}
      </p>
    </div>
  );
}

function Headers({ load }: { load: () => Promise<EmailHeader[] | null> }) {
  const [headers, setHeaders] = useState<EmailHeader[] | null | "error">(null);

  useEffect(() => {
    let current = true;
    load().then((result) => current && setHeaders(result ?? "error"));
    return () => {
      current = false;
    };
  }, [load]);

  if (headers === null) return <p className="muted" role="status">Carregando os cabeçalhos…</p>;
  if (headers === "error") return <p className="alert alert-bad" role="alert">Não deu pra carregar os cabeçalhos.</p>;
  return (
    <dl className="headers">
      {headers.map((header, index) => (
        <div key={index} className="header-row">
          <dt className="mono">{header.name}</dt>
          <dd className="mono">{header.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A Mensagem aberta: código em destaque, abas HTML / Texto / Cabeçalhos, .eml e anexos. */
export function MessageReader({ message, inboxAddress, now, rawUrl, attachmentUrl, loadHeaders, onBack }: MessageReaderProps) {
  const hasHtml = Boolean(message.html);
  const [tab, setTab] = useState<Tab>(hasHtml ? "html" : "text");
  const text = message.text?.trim() ? message.text : message.html ? htmlToText(message.html) : "";
  const available = message.status === "ready";

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "html", label: "HTML", show: hasHtml },
    { id: "text", label: "Texto", show: true },
    { id: "headers", label: "Cabeçalhos", show: message.hasRaw },
  ];

  return (
    <article aria-label="Mensagem aberta" className="reader">
      <button type="button" className="back-link" onClick={onBack}>
        ‹ Mensagens
      </button>
      <header className="reader-head">
        <h1 className="reader-subject">{message.subject || "(sem assunto)"}</h1>
        <p className="muted small">
          De {message.from} · para {inboxAddress} · {timeAgo(message.receivedAt, now)}
        </p>
      </header>

      {message.verificationCode ? <VerificationCode code={message.verificationCode} /> : null}

      {available ? (
        <>
          <div className="tabs" role="tablist" aria-label="Formato">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="reader-panel"
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            <span className="spacer" />
            {message.hasRaw ? (
              <a className="tab-link" href={rawUrl} download>
                Baixar .eml
              </a>
            ) : null}
          </div>

          <div id="reader-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="reader-panel">
            {tab === "html" && message.html ? (
              <div className="frame-box">
                <span className="frame-label">HTML isolado (sandbox)</span>
                <iframe
                  title="Conteúdo do email"
                  className="email-frame"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer"
                  srcDoc={sandboxedDocument(message.html)}
                />
              </div>
            ) : null}
            {tab === "text" ? <pre className="email-text">{text || "(sem texto)"}</pre> : null}
            {tab === "headers" ? <Headers load={loadHeaders} /> : null}
          </div>
        </>
      ) : (
        <Unavailable status={message.status} />
      )}

      {message.attachments.length > 0 ? (
        <section aria-labelledby="attachments-title" className="attachments">
          <h2 id="attachments-title" className="eyebrow">
            Anexos
          </h2>
          <ul className="plain-list row wrap">
            {message.attachments.map((attachment, index) => {
              const label = attachment.filename ?? `anexo ${index + 1}`;
              const size = formatBytes(attachment.size);
              return (
                <li key={attachment.id ?? index}>
                  {message.hasRaw ? (
                    <a className="attachment" href={attachmentUrl(index)} download>
                      <FileIcon />
                      {label}
                      {size ? <span className="muted small">{size}</span> : null}
                    </a>
                  ) : (
                    <span className="attachment is-disabled" title="O email original não foi guardado">
                      <FileIcon />
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
