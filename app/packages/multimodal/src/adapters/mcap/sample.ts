import type { SampleRendererProps } from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../query/bytes";

function normalizeFilepath(value: unknown): string | null {
  if (typeof value === "string" && value) {
    return value;
  }

  return null;
}

function normalizeSizeBytes(value: number | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value).toString();
  }

  return null;
}

function remoteReadProfile(filepath: string) {
  return /^(https?|s3|gs|gcs|az|abfs|abfss):\/\//i.test(filepath)
    ? BYTE_SOURCE_READ_PROFILE.REMOTE
    : BYTE_SOURCE_READ_PROFILE.LOCAL;
}

/**
 * Builds an MCAP byte source from the modal sample filepath.
 */
export function getMcapSourceDescriptor(
  ctx: SampleRendererProps["ctx"],
): ByteSourceDescriptor | null {
  const media = ctx.media;
  const sample = ctx.sample.sample;

  const filepath = normalizeFilepath(media.path);

  if (!filepath) {
    return null;
  }

  // compute_metadata() can give us an initial size hint, but byte readers still
  // discover the transport size from HEAD or Content-Range when this is absent.
  const sizeBytes = normalizeSizeBytes(sample.metadata?.size_bytes);

  return {
    readProfile: remoteReadProfile(filepath),
    sizeBytes: sizeBytes ?? undefined,
    sourceId: sample._id,
    url: getSampleSrc(filepath),
  };
}
