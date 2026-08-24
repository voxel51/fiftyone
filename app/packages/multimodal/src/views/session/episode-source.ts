import {
  createSampleRendererMediaContext,
  type SampleRendererProps,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";

import { BYTE_SOURCE_READ_PROFILE, type ByteSourceDescriptor } from "../../ir";
import type { EpisodeSource, SampleDescriptor } from "../../ports";
import {
  getSourceSessionHints,
  resolveSourceFactsHints,
  SOURCE_FACTS_MCAP_ADAPTER_ID,
  type SourceFactsScope,
} from "../../runtime";

/** Builds the format-neutral sample facts used by lazy adapter detection. */
export function sampleDescriptorFromContext(
  ctx: SampleRendererProps["ctx"],
): SampleDescriptor {
  return {
    mediaType: ctx.dataset.mediaType,
    path: ctx.media?.path ?? undefined,
  };
}

/** Builds adapter-detection facts for an arbitrary sample and media field. */
export function sampleDescriptorFromSample(
  sample: SampleRendererSampleLike,
  mediaField: string,
  mediaType?: string,
): SampleDescriptor {
  const media = createSampleRendererMediaContext(sample, mediaField);
  return { mediaType, path: media.path ?? undefined };
}

/** Builds a byte-addressable episode source from the active sample. */
export function episodeByteSourceFromContext(
  ctx: SampleRendererProps["ctx"],
): ByteSourceDescriptor | null {
  return byteSourceFromSample(ctx.sample.sample, ctx.media?.path ?? null);
}

/** Builds a byte-addressable episode source for an arbitrary sample. */
export function episodeByteSourceFromSample(
  sample: SampleRendererSampleLike,
  mediaField: string,
): ByteSourceDescriptor | null {
  const media = createSampleRendererMediaContext(sample, mediaField);
  return byteSourceFromSample(sample.sample, media.path);
}

/** Wraps one physical recording in the multi-asset episode port. */
export function episodeSourceFromByteSource(
  source: ByteSourceDescriptor,
  sourceFactsScope?: SourceFactsScope,
): EpisodeSource {
  const hints = getSourceSessionHints(source, SOURCE_FACTS_MCAP_ADAPTER_ID);
  return {
    assets: {
      list: async () => [
        {
          id: source.sourceId,
          role: "recording",
        },
      ],
      resolve: async (assetId) => {
        if (assetId !== source.sourceId) {
          throw new Error(`Unknown episode asset: ${assetId}`);
        }
        return source;
      },
    },
    episodeId: source.sourceId,
    ...(hints?.manifestHint ? { manifestHint: hints.manifestHint } : {}),
    ...(hints?.playbackHint ? { playbackHint: hints.playbackHint } : {}),
    ...(sourceFactsScope
      ? {
          resolveHints: (options) =>
            resolveSourceFactsHints(
              source,
              sourceFactsScope,
              SOURCE_FACTS_MCAP_ADAPTER_ID,
              options,
            ),
        }
      : {}),
  };
}

function byteSourceFromSample(
  sample: SampleRendererSampleLike["sample"],
  mediaPath: string | null,
): ByteSourceDescriptor | null {
  if (!mediaPath) return null;
  const sizeBytes = sample.metadata?.size_bytes;
  return {
    readProfile: /^(https?|s3|gs|gcs|az|abfs|abfss):\/\//i.test(mediaPath)
      ? BYTE_SOURCE_READ_PROFILE.REMOTE
      : BYTE_SOURCE_READ_PROFILE.LOCAL,
    sizeBytes:
      typeof sizeBytes === "number" && Number.isFinite(sizeBytes)
        ? Math.max(0, Math.trunc(sizeBytes)).toString()
        : undefined,
    sourceId: sample._id,
    url: getSampleSrc(mediaPath),
  };
}
