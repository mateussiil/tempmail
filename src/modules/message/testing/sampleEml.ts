/** Um `.eml` sintético (nada de email real) com texto, HTML e um anexo PDF. */
export function sampleEml(): Uint8Array {
  const pdf = Buffer.from("%PDF-1.4 nota fiscal de teste").toString("base64");
  const eml = [
    "From: Loja Exemplo <pedidos@loja.exemplo>",
    "To: teste@tmp.exemplo.test",
    "Subject: Pedido 1042 confirmado",
    "Message-ID: <pedido-1042@loja.exemplo>",
    "Date: Thu, 05 Nov 2026 12:00:00 +0000",
    "X-Teste: uma linha",
    "  dobrada",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="fronteira"',
    "",
    "--fronteira",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "A nota fiscal segue em anexo.",
    "--fronteira",
    'Content-Type: application/pdf; name="nota-fiscal-1042.pdf"',
    'Content-Disposition: attachment; filename="nota-fiscal-1042.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    pdf,
    "--fronteira--",
    "",
  ].join("\r\n");
  return new TextEncoder().encode(eml);
}
