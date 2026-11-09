# Recebimento de e-mail (inbound) para o tempmail: comparação das opções

Data da pesquisa: 2026-11-04. Contexto: catch-all em um **subdomínio** (`*@tmp.example.com`), app Next.js + Postgres em Coolify (self-hosted), só recebimento, pouco volume. O usuário já manda e-mail pelo Resend.

---

## (a) Resend Receiving (inbound): **existe e está em GA**

- Docs: https://resend.com/docs/dashboard/receiving/introduction · blog do lançamento: https://resend.com/blog/inbound-emails
- **Como funciona:** você adiciona um registro MX num domínio verificado no Resend, e o Resend passa a aceitar e-mail para "**qualquer endereço** daquele domínio" (o catch-all já vem ligado, sem regra a configurar). Também existe um subdomínio gerenciado `<id>.resend.app`, bom para testes.
- **Subdomínio:** é o que a própria doc recomenda quando já existe MX no apex: "create a subdomain (e.g. `subdomain.example.com`) and add the MX record there". O valor do MX vem do painel; os exemplos são `receive.forge.rmta.net` e `inbound-smtp.<region>.amazonaws.com`. Copie o valor mostrado no painel. O MX do Resend precisa ter a menor prioridade do (sub)domínio. https://resend.com/docs/dashboard/receiving/custom-domains
- **Webhook:** evento `email.received`, configurado na página Webhooks. Não confundir com `inbox.email.received`, que é do produto "Inboxes", outro recurso. https://resend.com/docs/dashboard/receiving/create-receiving-webhook
- **O payload NÃO tem o corpo.** A doc diz: "Webhooks do not include the email body, headers, or attachments, only their metadata. You must call the Received emails API or the Attachments API to retrieve them." O payload traz `type`, `created_at`, `data.email_id`, `from`, `to`, `received_for[]`, `message_id`, `subject` e `attachments[]` só com metadados (`filename`, `content_type`, `content_disposition`, `content_id`...).
- **Buscar o conteúdo:** chame o Retrieve Received Email (`resend.emails.receiving.get(id)` / `GET /emails/receiving/{id}`). A resposta tem `html` (imagens inline viram data-URI por padrão, `html_format: "data_uri"`), `text`, `headers`, `attachments[]` e **`raw.download_url`**, uma URL assinada (CloudFront) do arquivo .eml original completo, com `expires_at`. https://resend.com/docs/api-reference/emails/retrieve-received-email
- **Anexos:** `resend.emails.receiving.attachments.list({ emailId })` devolve um `download_url` por anexo, **válido por 1 hora**. Se quiser guardar o anexo, copie para storage próprio (ou para o Postgres como bytea) durante o processamento. https://resend.com/docs/dashboard/receiving/attachments
- **Armazenamento:** o Resend guarda o e-mail mesmo que o webhook falhe ou não exista, então dá para reprocessar ou fazer polling. A retenção de dados no Free é de **30 dias**.
- **Assinatura:** é Svix. Os headers são `svix-id`, `svix-timestamp` e `svix-signature`. Valide com `resend.webhooks.verify({ payload: rawBody, headers: {id, timestamp, signature}, webhookSecret })` ou com o pacote `svix`. **É obrigatório usar o raw body** (no Next.js App Router, `await req.text()`). https://resend.com/docs/webhooks/verify-webhooks-requests
- **Retries:** tentativa imediata, depois 5s, 5min, 30min, 2h, 5h, 10h e 10h. Se o endpoint continuar falhando, ele é desativado e o time recebe um e-mail. Dá para dar replay. https://resend.com/docs/webhooks/retries-and-replays
- **Preço e limites:** receber não tem preço à parte; o recurso vem em todos os planos, mas **cada e-mail recebido consome a mesma cota de transacionais**. No Free são 3.000/mês, **100/dia** (contando envio + recebimento), 3 domínios, **1 endpoint de webhook** e retenção de 30 dias. https://resend.com/pricing
  - Atenção: a cota é compartilhada com o envio que o usuário já faz. Spam batendo no catch-all também consome cota. Não achei na doc um limite de tamanho de mensagem recebida.

## (b) Cloudflare Email Routing + Email Worker

- **Catch-all só no apex.** A doc de subdomínios diz: "**Catch-all rules are only available for the apex domain.**" No subdomínio só valem regras literais (endereço por endereço), até **200 regras por domínio**. https://developers.cloudflare.com/email-routing/setup/subdomains/ · https://developers.cloudflare.com/email-routing/limits/
  - Com isso, `*@tmp.example.com` **não funciona** no Cloudflare. As saídas seriam usar um domínio dedicado (barato) e fazer catch-all no apex dele, ou criar uma regra por endereço via API (com teto de 200, o que não serve para tempmail).
- Também exige que o DNS da zona esteja no Cloudflare.
- **Worker:** o catch-all aceita a ação "Send to a Worker". O handler `email(message)` recebe `from`, `to`, `headers`, `raw` (um ReadableStream do MIME bruto), `rawSize` e `setReject()`. Para mandar ao app, basta um `fetch(POST)` com `message.raw` no body e um HMAC/shared secret criado por você (não existe assinatura nativa). O parse pode ser feito no app com `postal-mime` ou `mailparser`. https://developers.cloudflare.com/email-routing/email-workers/runtime-api/
- **Limites:** mensagens de até **25 MiB** (acima disso são rejeitadas) e os limites de CPU/memória dos Workers. No plano Free, um handler pesado pode falhar com `EXCEEDED_CPU`; o ideal é só repassar o stream. Email Routing é gratuito, e o Workers Free dá ~100k requisições/dia.
- Vantagem: o payload é o MIME completo de uma vez, sem segunda chamada de API e sem URL que expira, e não consome a cota do Resend.

## (c) SMTP self-hosted no servidor (Haraka, Postfix, `smtp-server` npm, Mailpit)

- Porta 25 **de entrada** costuma ficar aberta em VPS; o bloqueio comum é na **saída**. A Hetzner, por exemplo, bloqueia saída nas portas 25/465, mas recebimento não precisa de saída. Fontes: fóruns (https://meta.discourse.org/t/ports-blocked-hetzner-cloud-server/225146, https://www.captaindns.com/de/blog/port-25-blocked-diagnosis-solutions). Confirme com o provedor do seu VPS.
- **No Coolify:** o Traefik faz proxy HTTP/S. SMTP precisa de mapeamento TCP direto da porta 25 para o container, fora do proxy. Se quiser STARTTLS, o certificado tem que ser gerenciado à parte. Os registros DNS são MX `tmp.example.com` → `mail.example.com` (A para o IP do VPS).
- **Ops e risco:** você fica exposto na internet a varredura e spam, então precisa de limite de tamanho, rate-limit, rejeitar RCPT de domínio que não é o seu (para não virar open relay) e talvez filtro de spam (rspamd). Se o servidor cair, os remetentes vão tentar de novo por alguns dias, mas nada fica guardado do seu lado. Mailpit é ferramenta de dev e não serve para encarar a internet. Haraka (Node) ou `smtp-server` + `mailparser` com 20–50 linhas resolvem, com custo zero de dinheiro e custo contínuo de manutenção.
- Vantagens: catch-all em subdomínio sem restrição, nada de cota, MIME completo e os dados nunca saem do servidor.

## (d) Outras opções

- **Postmark Inbound:** gera JSON com corpo e anexos em base64 no próprio webhook. Só está nos planos **Pro (US$ 16,50/mês) e Platform**; o Free não tem. https://postmarkapp.com/pricing
- **Mailgun Routes:** `match_recipient(".*@tmp.example.com")` → `forward(url)`, e o POST multipart já vem com o corpo e os anexos. Segundo fontes de terceiros, o Free (100/dia) inclui 1 route (não verificado na página oficial). https://help.mailgun.com/hc/en-us/articles/203068914
- **CloudMailin:** de acordo com a página de planos, o Free tem 10k/mês mas mensagens de **512 KB** e domínio próprio só nos pagos (a partir de US$ 25/mês). https://www.cloudmailin.com/plans
- **SendGrid Inbound Parse:** também faz POST multipart com corpo e anexos; o lado de envio do SendGrid não tem mais plano grátis permanente. Não avaliei a fundo.

---

## Recomendação

**Resend Receiving**, num MX em `tmp.example.com`. É a única opção gerenciada que dá **catch-all em subdomínio sem domínio extra**, usa a conta e o SDK que já existem, tem assinatura pronta (Svix) e guarda o e-mail se o webhook falhar. Para o volume pessoal ou de time, cabe no Free.

Plano B: se a cota compartilhada de 100/dia ou o spam virar problema, ou se a ideia for zero dependência externa, rode **SMTP próprio com `smtp-server` + `mailparser`** (ou Haraka) num container com a porta 25 mapeada. Cloudflare só vale a pena se for aceitável usar um **domínio dedicado no apex**, porque não tem catch-all em subdomínio.

## Fatos de que as próximas decisões dependem

1. **Formato do payload (Resend):** o webhook `email.received` traz só metadados (`data.email_id`, from, to, received_for, subject, message_id, attachments[meta]). É preciso uma **segunda chamada** `emails.receiving.get(email_id)` para pegar html, text, headers e raw.download_url. O handler deve ser idempotente por `email_id`/`svix-id`, porque há retries.
2. **Anexos:** os URLs de download **expiram em 1h**, e o raw também tem `expires_at`. Para mostrar anexos depois, baixe e guarde (Postgres bytea, volume ou S3) durante o processamento. Outra opção é baixar o `.eml` raw e guardar só ele, fazendo o parse sob demanda (`mailparser`).
3. **HTML:** as imagens inline já vêm como data-URI. O HTML precisa ser sanitizado (DOMPurify) ou renderizado num `iframe sandbox`.
4. **Verificação:** use o raw body (`req.text()`) + `RESEND_WEBHOOK_SECRET` com Svix. É **1 endpoint de webhook** no Free.
5. **Limites (Resend Free):** 100 e-mails/dia e 3.000/mês, **somados a envio e recebimento**, e retenção de 30 dias no Resend. Não há limite de tamanho publicado. Como o catch-all recebe tudo, endereços que não existem no app também consomem cota, e o descarte só pode ser feito depois de recebido.
6. **DNS:** MX de `tmp.example.com` → valor do painel do Resend, com a menor prioridade. Não mexe no MX do apex.
7. **Para comparação:** Cloudflare aceita até 25 MiB e entrega o MIME completo num único POST, mas tem catch-all só no apex. SMTP próprio não tem limite além do que você configurar.
