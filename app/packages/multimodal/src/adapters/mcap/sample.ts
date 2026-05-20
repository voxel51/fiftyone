import type { SampleRendererProps } from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../client/resources";

type SampleRecord = {
  readonly _id?: unknown;
  readonly id?: unknown;
  readonly filepath?: unknown;
  readonly metadata?: {
    readonly size_bytes?: unknown;
    readonly sizeBytes?: unknown;
  };
};

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return value;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return null;
}

function normalizeSizeBytes(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return /^\d+$/.test(value) ? value : null;
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value).toString();
  }

  if (typeof value === "bigint" && value >= 0n) {
    return value.toString();
  }

  return null;
}

function remoteReadProfile(filepath: string) {
  return /^(https?|s3|gs|gcs|az|abfs|abfss):\/\//i.test(filepath)
    ? BYTE_SOURCE_READ_PROFILE.REMOTE
    : undefined;
}

/**
 * Builds an MCAP byte source from the modal sample filepath.
 */
export function getMcapSourceDescriptor(
  ctx: SampleRendererProps["ctx"]
): ByteSourceDescriptor | null {
  const sampleRecord = ctx.sample.sample as SampleRecord;
  const filepath = normalizeIdentifier(sampleRecord.filepath);

  if (!filepath) {
    return null;
  }

  // compute_metadata() can give us an initial size hint, but byte readers still
  // discover the transport size from HEAD or Content-Range when this is absent.
  const sizeBytes = normalizeSizeBytes(
    sampleRecord.metadata?.size_bytes ?? sampleRecord.metadata?.sizeBytes
  );
  const readProfile = remoteReadProfile(filepath);

  return {
    readProfile: readProfile ?? undefined,
    sizeBytes: sizeBytes ?? undefined,
    sourceId: filepath,
    url: getSampleSrc(filepath),
  };
}
