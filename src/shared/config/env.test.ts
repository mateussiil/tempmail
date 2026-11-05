import { describe, expect, it } from "vitest";
import {
  mailDomain,
  maxMessageBytes,
  missingAuthEnv,
  missingReceivingEnv,
  positiveIntEnv,
  resendApiUrl,
  webhookDebugEnabled,
} from "./env";

describe("variáveis do recebimento", () => {
  const complete = {
    RESEND_API_KEY: "re_x",
    RESEND_WEBHOOK_SECRET: "whsec_x",
    R2_ENDPOINT: "https://conta.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "segredo",
    R2_BUCKET: "tempmail",
  };

  it("missingReceivingEnv aponta só os nomes que faltam ou estão vazios", () => {
    expect(missingReceivingEnv(complete)).toEqual([]);
    expect(missingReceivingEnv({ ...complete, RESEND_API_KEY: "", R2_BUCKET: undefined })).toEqual([
      "RESEND_API_KEY",
      "R2_BUCKET",
    ]);
    expect(missingReceivingEnv({})).toHaveLength(6);
  });

  it("resendApiUrl tem padrão e tira a barra do fim", () => {
    expect(resendApiUrl({})).toBe("https://api.resend.com");
    expect(resendApiUrl({ RESEND_API_URL: "http://127.0.0.1:9000/" })).toBe("http://127.0.0.1:9000");
  });

  it("maxMessageBytes usa 10 MB por padrão e aceita sobrescrever", () => {
    expect(maxMessageBytes({})).toBe(10 * 1024 * 1024);
    expect(maxMessageBytes({ MAX_MESSAGE_MB: "2" })).toBe(2 * 1024 * 1024);
  });

  it("webhookDebugEnabled só liga com 'true'", () => {
    expect(webhookDebugEnabled({})).toBe(false);
    expect(webhookDebugEnabled({ WEBHOOK_DEBUG_LOG: "1" })).toBe(false);
    expect(webhookDebugEnabled({ WEBHOOK_DEBUG_LOG: " TRUE " })).toBe(true);
  });
});

describe("positiveIntEnv", () => {
  it("usa o padrão quando a variável está ausente ou vazia", () => {
    expect(positiveIntEnv("LIMITE", 20, {})).toBe(20);
    expect(positiveIntEnv("LIMITE", 20, { LIMITE: "" })).toBe(20);
    expect(positiveIntEnv("LIMITE", 20, { LIMITE: "  " })).toBe(20);
  });

  it("lê um inteiro positivo", () => {
    expect(positiveIntEnv("LIMITE", 20, { LIMITE: "5" })).toBe(5);
  });

  it("lança, citando a variável, quando o valor é inválido", () => {
    for (const bad of ["0", "-3", "abc", "2.5"]) {
      expect(() => positiveIntEnv("LIMITE", 20, { LIMITE: bad })).toThrow(/LIMITE/);
    }
  });
});

describe("mailDomain", () => {
  it("tem um padrão e aceita sobrescrever, em minúsculas", () => {
    expect(mailDomain({})).toBe("tmp.mateussiil.com.br");
    expect(mailDomain({ MAIL_DOMAIN: " Outro.Exemplo.TEST " })).toBe("outro.exemplo.test");
  });
});

const complete: Record<string, string | undefined> = {
  BETTER_AUTH_URL: "https://exemplo.test",
  BETTER_AUTH_SECRET: "segredo",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "segredo-github",
};

describe("missingAuthEnv", () => {
  it("não aponta nada quando tudo está definido", () => {
    expect(missingAuthEnv(complete)).toEqual([]);
  });

  it("aponta as variáveis ausentes e as vazias, sem expor valores", () => {
    const env = { ...complete, BETTER_AUTH_SECRET: "", GITHUB_CLIENT_ID: undefined };

    expect(missingAuthEnv(env)).toEqual(["BETTER_AUTH_SECRET", "GITHUB_CLIENT_ID"]);
  });
});
