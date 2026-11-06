/**
 * Como conectar cada ferramenta ao tempmail com uma Chave de API recém-criada.
 * Apresentação pura: monta os passos (texto e código pronto pra copiar) a
 * partir da URL do MCP e do segredo, que só existe na tela de criação.
 */

export type SetupStep = {
  title: string;
  code: string;
};

export type ClientSetup = {
  id: string;
  label: string;
  /** Uma linha sobre quando usar. */
  hint: string;
  steps: SetupStep[];
  /** Observação curta depois dos passos. */
  note?: string;
};

/** O comando do Claude Code (o mesmo que a tela mostrava antes do seletor). */
export function claudeMcpCommand(mcpUrl: string, token: string): string {
  return `claude mcp add --transport http tempmail ${mcpUrl} --header "Authorization: Bearer ${token}"`;
}

/** A URL do app, a partir da URL do MCP (`…/api/mcp`). */
export function appUrlFromMcp(mcpUrl: string): string {
  return mcpUrl.replace(/\/api\/mcp\/?$/, "");
}

export function clientSetups(mcpUrl: string, token: string): ClientSetup[] {
  const appUrl = appUrlFromMcp(mcpUrl);

  return [
    {
      id: "claude-code",
      label: "Claude Code",
      hint: "O CLI da Anthropic.",
      steps: [{ title: "No terminal:", code: claudeMcpCommand(mcpUrl, token) }],
      note: "Depois, rode /mcp dentro do Claude Code pra conferir se o tempmail aparece conectado.",
    },
    {
      id: "codex",
      label: "Codex",
      hint: "O CLI da OpenAI.",
      steps: [
        { title: "Guarde a chave numa variável de ambiente (no seu ~/.zshrc ou ~/.bashrc):", code: `export TEMPMAIL_KEY=${token}` },
        {
          title: "Adicione o servidor:",
          code: `codex mcp add tempmail --url ${mcpUrl} --bearer-token-env-var TEMPMAIL_KEY`,
        },
      ],
      note: "O Codex lê a variável ao abrir: se ela não estiver definida, a conexão falha.",
    },
    {
      id: "cursor",
      label: "Cursor",
      hint: "O editor.",
      steps: [
        {
          title: "Em ~/.cursor/mcp.json (ou .cursor/mcp.json no projeto):",
          code: JSON.stringify(
            { mcpServers: { tempmail: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } },
            null,
            2,
          ),
        },
      ],
      note: "O arquivo guarda o segredo: não o coloque num repositório.",
    },
    {
      id: "grok",
      label: "Grok (API)",
      hint: "A API da xAI chama o MCP dos servidores dela.",
      steps: [
        {
          title: "Em Python, com o SDK da OpenAI apontando para a xAI:",
          code: [
            "import os",
            "from openai import OpenAI",
            "",
            'client = OpenAI(api_key=os.environ["XAI_API_KEY"], base_url="https://api.x.ai/v1")',
            "response = client.responses.create(",
            '    model="grok-4.7",',
            '    input="Crie uma Caixa no tempmail e espere o código de verificação.",',
            "    tools=[{",
            '        "type": "mcp",',
            '        "server_label": "tempmail",',
            `        "server_url": "${mcpUrl}",`,
            `        "headers": {"X-API-Key": "${token}"},`,
            "    }],",
            ")",
          ].join("\n"),
        },
      ],
      note: "Quem chama o tempmail são os servidores da xAI, então a chave passa por eles: use uma chave só pra isso.",
    },
    {
      id: "generic",
      label: "Outro cliente MCP",
      hint: "Qualquer cliente com MCP remoto (Streamable HTTP).",
      steps: [
        { title: "URL do servidor:", code: mcpUrl },
        { title: "Cabeçalho:", code: `Authorization: Bearer ${token}` },
      ],
      note: "Se o cliente não deixa escolher o Authorization, use o cabeçalho X-API-Key com a mesma chave.",
    },
    {
      id: "rest",
      label: "Bot (API REST)",
      hint: "Sem MCP: um script ou bot seu chamando a API.",
      steps: [
        {
          title: "Criar uma Caixa:",
          code: `curl -X POST ${appUrl}/api/inboxes -H "Authorization: Bearer ${token}"`,
        },
        {
          title: "Ler as Mensagens dela (troque <id> pelo id que voltou):",
          code: `curl ${appUrl}/api/inboxes/<id>/messages -H "Authorization: Bearer ${token}"`,
        },
      ],
      note: "As Mensagens já trazem o verificationCode. As outras rotas estão no README.",
    },
  ];
}
