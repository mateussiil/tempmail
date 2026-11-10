# Tempmail

Caixas de email temporárias de fácil acesso para IA: agentes criam, esperam e leem Mensagens pelo MCP e pela API; a página serve às pessoas do time. Cadastro, login e testes são usos, não o centro.

## Language

**Membro**:
Pessoa do time autorizada a usar o sistema; dona de caixas e chaves de API.
_Avoid_: Usuário, conta, cliente

**Chave de API**:
Credencial nomeada de um Membro para a API e o MCP, com os mesmos poderes dele na página; vale até ser revogada.
_Avoid_: Token, API key (em texto em português), senha

**Caixa**:
Um endereço de email no subdomínio, criado explicitamente por um Membro, que recebe Mensagens enquanto está ativo.
_Avoid_: Inbox, mailbox, endereço (quando se quer dizer a caixa inteira)

**Dono**:
O Membro que criou uma Caixa pela primeira vez; o endereço fica ligado a ele para sempre, e só ele pode voltar a usá-lo.
_Avoid_: Proprietário, criador

**Caixa ativa / Caixa expirada**:
Ativa recebe Mensagens; expirada não recebe e não tem mais Mensagens, só guarda o endereço e o Dono.
_Avoid_: Caixa apagada, caixa morta

**Reativar**:
O Dono volta a usar uma Caixa expirada; ela recomeça vazia, com novo prazo.
_Avoid_: Recriar, restaurar

**Manter**:
Marca que tira o prazo de uma Caixa; ela fica ativa até o Dono apagá-la.
_Avoid_: Fixar, permanente

**Mensagem**:
Um email recebido por uma Caixa.
_Avoid_: Email (ambíguo com o endereço), mail

**Código de verificação**:
Sequência numérica de uma Mensagem usada para confirmar uma ação (cadastro, login), extraída do assunto ou do corpo.
_Avoid_: OTP, token, senha

**Email órfão**:
Email que chega para um endereço sem Caixa ativa; é descartado.
_Avoid_: Email perdido, não entregue
