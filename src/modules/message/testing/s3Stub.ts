import { startStubServer } from "./stubServer";

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Um bucket S3 mínimo em memória (PUT, GET, DELETE e ListObjectsV2 com
 * paginação), para testar o R2 sem rede. `pageSize` força a paginação.
 */
export async function startS3Stub(options: { bucket?: string; pageSize?: number } = {}) {
  const bucket = options.bucket ?? "tempmail";
  const pageSize = options.pageSize ?? 1000;
  const objects = new Map<string, Buffer>();

  type Reply = { status: number; headers?: Record<string, string>; body?: string | Buffer };
  const server = await startStubServer((request): Reply => {
    const url = new URL(request.url, "http://s3");
    const key = decodeURIComponent(url.pathname.replace(new RegExp(`^/${bucket}/?`), ""));

    if (request.method === "GET" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const start = Number(url.searchParams.get("continuation-token") ?? "0");
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const page = all.slice(start, start + pageSize);
      const truncated = start + pageSize < all.length;
      const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<ListBucketResult><Name>${bucket}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount>`,
        `<IsTruncated>${truncated}</IsTruncated>`,
        truncated ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : "",
        ...page.map((k) => `<Contents><Key>${escapeXml(k)}</Key><Size>${objects.get(k)!.length}</Size></Contents>`),
        "</ListBucketResult>",
      ].join("");
      return { status: 200, headers: { "content-type": "application/xml" }, body };
    }
    if (request.method === "PUT") {
      objects.set(key, request.body);
      return { status: 200, headers: { etag: '"x"' } };
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      return { status: 204 };
    }
    const found = objects.get(key);
    return found
      ? { status: 200, headers: { "content-type": "message/rfc822" }, body: found }
      : { status: 404, headers: { "content-type": "application/xml" }, body: "<Error><Code>NoSuchKey</Code></Error>" };
  });

  return { ...server, objects };
}
