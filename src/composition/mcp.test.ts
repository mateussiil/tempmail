// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sentApiKey } from "./mcp";

describe("sentApiKey", () => {
  it("tm_ no Bearer ou qualquer X-API-Key é Chave de API; outro Bearer é token OAuth", () => {
    expect(sentApiKey(new Headers({ authorization: "Bearer tm_abcdefghijklmnop" }))).toBe(true);
    expect(sentApiKey(new Headers({ "x-api-key": "qualquer" }))).toBe(true);
    expect(sentApiKey(new Headers({ authorization: "Bearer eyJhbGciOi.x.y" }))).toBe(false);
    expect(sentApiKey(new Headers())).toBe(false);
  });
});
