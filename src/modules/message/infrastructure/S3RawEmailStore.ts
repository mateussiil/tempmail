import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ConfigurationError, TransientError, type RawEmailReader, type RawEmailStore } from "../application/ports";

export function createR2Client(options: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxAttempts?: number;
}): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: options.endpoint,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    forcePathStyle: true,
    // O R2 não precisa dos checksums extras que o SDK novo manda por padrão.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: options.maxAttempts,
  });
}

/** Guarda e lê o `.eml` no bucket do R2 (API compatível com S3). */
export class S3RawEmailStore implements RawEmailStore, RawEmailReader {
  constructor(
    private readonly options: { client: S3Client; bucket: string },
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    try {
      await this.options.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 401 || status === 403) {
        throw new ConfigurationError(
          `O R2 recusou a credencial ao gravar ${key} (${status}). Confira R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e o bucket.`,
        );
      }
      throw new TransientError(`Falha ao gravar ${key} no R2: ${String(error)}`);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const response = await this.options.client.send(
        new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      return response.Body ? await response.Body.transformToByteArray() : null;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (error instanceof NoSuchKey || status === 404) return null;
      throw error;
    }
  }
}
