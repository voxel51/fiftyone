import type { SampleRendererProps } from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import { BYTE_SOURCE_READ_PROFILE } from "../client";
import type { McapSourceDescriptor } from "./types";

type SampleContext = SampleRendererProps["ctx"];
type SampleRecord = {
  readonly _id?: unknown;
  readonly id?: unknown;
  readonly filepath?: unknown;
  // todo: get it from inventory
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

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }

  if (typeof value === "bigint") {
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
 * Extracts the dataset and sample identifiers.
 */
export function getSampleIdentifiers(ctx: SampleContext): {
  readonly datasetId: string | null;
  readonly sampleId: string | null;
} {
  const sampleRecord = ctx.sample.sample as SampleRecord;

  return {
    datasetId: normalizeIdentifier(ctx.dataset.datasetId),
    sampleId:
      normalizeIdentifier(sampleRecord._id) ??
      normalizeIdentifier(sampleRecord.id),
  };
}

/**
 * Builds an MCAP byte source from the modal sample filepath.
 */
export function getMcapSourceDescriptor(
  ctx: SampleContext
): McapSourceDescriptor | null {
  const sampleRecord = ctx.sample.sample as SampleRecord;
  const filepath = normalizeIdentifier(sampleRecord.filepath);

  if (!filepath) {
    return null;
  }

  const sizeBytes = normalizeSizeBytes(
    sampleRecord.metadata?.size_bytes ?? sampleRecord.metadata?.sizeBytes
  );
  const readProfile = remoteReadProfile(filepath);

  return {
    ...(readProfile ? { readProfile } : {}),
    sizeBytes: sizeBytes ?? undefined,
    sourceId: filepath,
    url: getSampleSrc(filepath),
  };
}
