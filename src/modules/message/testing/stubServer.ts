import http from "node:http";
import type { AddressInfo } from "node:net";

export type RecordedRequest = {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
};

type Handler = (request: RecordedRequest) => { status: number; headers?: Record<string, string>; body?: string | Buffer };

/** Servidor HTTP local para os testes fazerem o papel do Resend e do R2. */
export async function startStubServer(handler: Handler, port = 0) {
  const requests: RecordedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const recorded: RecordedRequest = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(recorded);
      const { status, headers, body } = handler(recorded);
      res.writeHead(status, headers);
      res.end(body);
    });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const { port: listening } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${listening}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
