import {
  createSampleRendererMediaContext,
  type SampleRendererProps,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import {
  withMediaAssetSrcs,
  type SampleMediaDescriptor,
} from "@fiftyone/utilities";

import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
  type ByteSourceReadProfile,
} from "../ir";

const REMOTE_URL = /^(https?|s3|gs|gcs|az|abfs|abfss):\/\//i;

/**
 * How an object's bytes are reached, from where the object is rather than how
 * the app addresses it: media this server reads for the browser is a local
 * read however the request is routed, and a signed object is not.
 */
export function readProfileOf(src: string): ByteSourceReadProfile {
  return REMOTE_URL.test(src)
    ? BYTE_SOURCE_READ_PROFILE.REMOTE
    : BYTE_SOURCE_READ_PROFILE.LOCAL;
}

/**
 * Byte-source derivation for the active sample. Lives in runtime/ (not
 * views/session) because edition grid overlays — which receive the same
 * SampleRendererProps the views do — key the source-bootstrap cache by this
 * descriptor, and the extensions facade may only re-export runtime/.
 */

/** Builds a byte-addressable episode source from the active sample. */
export function episodeByteSourceFromContext(
  ctx: SampleRendererProps["ctx"],
): ByteSourceDescriptor | null {
  return byteSourceFromSample(ctx.sample.sample, ctx.media?.path ?? null);
}

/**
 * The byte source a reference-backed tile plays: the video its page named as
 * the sample's poster. Nothing is derived and nothing is asked for. The id is
 * the asset's, the same one the modal's session resolves, so both read one
 * cache entry.
 */
export function episodeByteSourceFromMediaReference(
  ctx: SampleRendererProps["ctx"],
  mediaSources: Readonly<Record<string, string>> | null | undefined,
): ByteSourceDescriptor | null {
  const media = (
    withMediaAssetSrcs(ctx.sample.sample, mediaSources) as {
      _media?: SampleMediaDescriptor | null;
    }
  )._media;
  const poster = media?.assets.find((asset) => asset.id === media.poster);
  if (!poster?.src) return null;

  return {
    readProfile: readProfileOf(poster.src),
    sourceId: poster.id,
    url: getSampleSrc(poster.src),
  };
}

/** Builds a byte-addressable episode source for an arbitrary sample. */
export function episodeByteSourceFromSample(
  sample: SampleRendererSampleLike,
  mediaField: string,
): ByteSourceDescriptor | null {
  const media = createSampleRendererMediaContext(sample, mediaField);
  return byteSourceFromSample(sample.sample, media.path);
}

function byteSourceFromSample(
  sample: SampleRendererSampleLike["sample"],
  mediaPath: string | null,
): ByteSourceDescriptor | null {
  if (!mediaPath) return null;
  const sizeBytes = sample.metadata?.size_bytes;
  return {
    readProfile: readProfileOf(mediaPath),
    sizeBytes:
      typeof sizeBytes === "number" && Number.isFinite(sizeBytes)
        ? Math.max(0, Math.trunc(sizeBytes)).toString()
        : undefined,
    sourceId: sample._id,
    url: getSampleSrc(mediaPath),
  };
}
