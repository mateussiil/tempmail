import { describe, expect, it } from "vitest";
import { htmlToText } from "./htmlToText";

describe("htmlToText", () => {
  it("tira as tags e mantém o texto", () => {
    expect(htmlToText("<p>Olá <b>Ana</b></p>")).toBe("Olá Ana");
  });

  it("transforma quebras e fim de bloco em linhas", () => {
    expect(htmlToText("<div>Seu código:</div><div>482913</div>")).toBe("Seu código:\n482913");
    expect(htmlToText("a<br>b<br/>c")).toBe("a\nb\nc");
  });

  it("separa células de tabela", () => {
    expect(htmlToText("<table><tr><td>Código</td><td>123456</td></tr></table>")).toBe(
      "Código 123456",
    );
  });

  it("descarta style, script, head e comentários", () => {
    const html =
      "<html><head><title>x</title><style>p{color:red}</style></head><body><!-- 111111 --><script>var a=222222</script>texto</body></html>";

    expect(htmlToText(html)).toBe("texto");
  });

  it("decodifica entidades comuns e numéricas", () => {
    expect(htmlToText("a&nbsp;b &amp; c &lt;d&gt; &#233; &#xE9; &quot;e&quot;")).toBe(
      'a b & c <d> é é "e"',
    );
  });

  it("deixa entidades desconhecidas ou inválidas como estão", () => {
    expect(htmlToText("&naoexiste; &#99999999;")).toBe("&naoexiste; &#99999999;");
  });

  it("junta espaços repetidos e linhas em branco demais", () => {
    expect(htmlToText("<p>a   b</p>\n\n\n\n<p>c</p>")).toBe("a b\n\nc");
  });
});
