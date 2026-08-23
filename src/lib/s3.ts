import { S3Client } from "@aws-sdk/client-s3";
import {
  loadRuntimeConfig,
  s3BucketSetting,
  s3EndpointSetting,
  s3PrefixSetting,
  s3RegionSetting,
} from "@/config/runtime";

export function loadS3Config() {
  const runtime = loadRuntimeConfig();
  const endpoint = s3EndpointSetting(runtime);
  const bucket = s3BucketSetting(runtime);
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint) throw new Error("S3_ENDPOINT is required");
  if (!bucket) throw new Error("S3_BUCKET is required");
  if (!accessKeyId) throw new Error("S3_ACCESS_KEY_ID is required");
  if (!secretAccessKey) throw new Error("S3_SECRET_ACCESS_KEY is required");
  return {
    endpoint,
    bucket,
    region: s3RegionSetting(runtime),
    accessKeyId,
    secretAccessKey,
    prefix: normalizeS3Prefix(s3PrefixSetting(runtime)),
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

export function isMissingS3Object(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; Code?: unknown; code?: unknown };
  return candidate.name === "NoSuchKey" || candidate.Code === "NoSuchKey" || candidate.code === "NoSuchKey";
}
