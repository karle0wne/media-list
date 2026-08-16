import { S3Client } from "@aws-sdk/client-s3";

const REQUIRED = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

export function loadS3Config() {
  for (const name of REQUIRED) if (!process.env[name]?.trim()) throw new Error(`${name} is required`);
  return {
    endpoint: process.env.S3_ENDPOINT!.trim(),
    bucket: process.env.S3_BUCKET!.trim(),
    region: process.env.S3_REGION?.trim() || "auto",
    accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
    prefix: normalizeS3Prefix(process.env.S3_PREFIX ?? "media-list/"),
  };
}

export function createS3Client(config = loadS3Config()) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

export function normalizeS3Prefix(value: string) {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}
