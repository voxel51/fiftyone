import {
  createSampleRendererMediaContext,
  type SampleRendererProps,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import {
  type MediaReferenceDescriptor,
  type SampleMediaDescriptor,
} from "@fiftyone/utilities";

import type { ByteSourceDescriptor } from "../../ir";
import type {
  AssetDescriptor,
  EpisodeOpenOptions,
  EpisodeSource,
  SampleDescriptor,
} from "../../ports";
import {
  getSourceSessionHints,
  resolveSourceFactsHints,
  SOURCE_FACTS_MCAP_ADAPTER_ID,
  type SourceFactsScope,
} from "../../runtime";
import { createAbortError } from "../../utils/cancellation";

// Byte-source derivation lives in runtime/ because extensions/timeline
// re-exports episodeByteSourceFromContext, and an extension may only reach
// the runtime layer through the host facade. Re-exported here for view-side
// callers.
export {
  episodeByteSourceFromContext,
  episodeByteSourceFromSample,
} from "../../runtime/episode-byte-source";
import { readProfileOf } from "../../runtime/episode-byte-source";

/**
 * An episode source whose sample carries its own coordinates. The adapter
 * reads the episode's own coordinates off the reference; the source only
 * locates the bytes those coordinates point at.
 */
export interface ReferenceEpisodeSource extends EpisodeSource {
  readonly reference: MediaReferenceDescriptor;
  /** The source's frame rate, when the sample recorded it. */
  readonly fps?: number;
}

/** Builds the format-neutral sample facts used by lazy adapter detection. */
export function sampleDescriptorFromContext(
  ctx: SampleRendererProps["ctx"],
): SampleDescriptor {
  return {
    mediaReference: ctx.media?.mediaReference,
    mediaType: ctx.media?.mediaType ?? ctx.dataset.mediaType,
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
  return {
    mediaReference: media.mediaReference,
    mediaType: mediaType ?? media.mediaType ?? undefined,
    path: media.path ?? undefined,
  };
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

/** What a reference-backed sample carries for its episode. */
export interface MediaReferenceSample {
  readonly fps?: number | null;
  /** Everything the sample's media is made of, as its page delivered it. */
  readonly media?: SampleMediaDescriptor | null;
  readonly tasks?: readonly string[] | null;
}

/**
 * Builds a multi-asset source for one reference-backed sample.
 *
 * The page said what the sample is made of and where each part is read from,
 * so nothing here asks the server for anything and nothing here knows how a
 * source is laid out.
 */
export function episodeSourceFromMediaReference(
  mediaReference: MediaReferenceDescriptor,
  sample: MediaReferenceSample,
): ReferenceEpisodeSource {
  // An asset with no location cannot be read, so it is not offered
  const assets = (
    (sample.media?.assets ?? []) as readonly (AssetDescriptor & {
      readonly src?: string;
    })[]
  ).filter((asset) => asset.src !== undefined);
  const fps =
    typeof sample.fps === "number" && sample.fps > 0 ? sample.fps : undefined;

  const listed = (options?: EpisodeOpenOptions) => {
    if (options?.signal?.aborted) {
      throw createAbortError("Episode asset request aborted");
    }
    return assets;
  };

  return {
    assets: {
      list: async (options) => {
        // A tile plays one camera but the grid lets the user pick which, so
        // every camera is listed; only the played one is ever read
        const preview = options?.preview === true;
        return listed(options).filter(
          (asset) => !preview || asset.role === "video-stream",
        );
      },
      resolve: async (assetId, options) => {
        const asset = listed(options).find(
          (candidate) => candidate.id === assetId,
        );
        if (!asset?.src) {
          throw new Error(`Unknown episode asset: ${assetId}`);
        }

        // sourceId is the asset's own id, one per physical object, so byte
        // caches are shared by every episode selecting it
        return {
          readProfile: readProfileOf(asset.src),
          sourceId: asset.id,
          url: getSampleSrc(asset.src),
        };
      },
    },
    episodeId: mediaReference.key,
    ...(fps !== undefined ? { fps } : {}),
    reference: mediaReference,
  };
}

/** Builds a manifest source for a reference-backed renderer context. */
export function episodeManifestSourceFromContext(
  ctx: SampleRendererProps["ctx"],
): ReferenceEpisodeSource | null {
  const mediaReference = ctx.media?.mediaReference;
  if (!mediaReference) return null;

  const sample = ctx.sample.sample as {
    readonly _media?: SampleMediaDescriptor | null;
    readonly fps?: number | null;
    readonly tasks?: readonly string[] | null;
  };
  return episodeSourceFromMediaReference(mediaReference, {
    fps: sample.fps,
    media: sample._media,
    tasks: sample.tasks,
  });
}
