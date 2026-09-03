import {
  createSampleRendererMediaContext,
  type SampleRendererProps,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";

import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
  type ByteSourceReadProfile,
} from "../../ir";
import type {
  AssetSelectorDescriptor,
  EpisodeOpenOptions,
  EpisodeSource,
  ManifestEpisodeSource,
  MediaReferenceDescriptor,
  SampleDescriptor,
} from "../../ports";
import {
  getSourceSessionHints,
  resolveSourceFactsHints,
  SOURCE_FACTS_MCAP_ADAPTER_ID,
  type SourceFactsScope,
} from "../../runtime";
import { createAbortError } from "../../utils/cancellation";
import { monotonicNowMs } from "../../utils/monotonic-time";
import {
  manifestMaxAgeMs,
  type TransportMediaAssetManifest,
} from "../../runtime/episode-manifest-transport";
import { requestEpisodeManifest } from "../../runtime/episode-manifests";

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

/** Builds a lazy multi-asset source from a sample-scoped manifest endpoint. */
export function episodeSourceFromMediaReference(
  datasetId: string,
  sampleId: string,
  mediaReference: MediaReferenceDescriptor,
): ManifestEpisodeSource {
  let manifest: TransportMediaAssetManifest | null = null;
  let manifestExpiresAtMs = 0;
  let manifestPromise: Promise<TransportMediaAssetManifest> | null = null;

  const getManifest = async (
    options?: EpisodeOpenOptions,
  ): Promise<TransportMediaAssetManifest> => {
    if (options?.signal?.aborted) {
      throw createAbortError("Episode manifest request aborted");
    }

    // Held only while the URLs inside it still grant access. A session open
    // past that re-resolves rather than reading against a lapsed
    // authorization, which nothing below this can renew.
    if (manifest && monotonicNowMs() < manifestExpiresAtMs) {
      return awaitCaller(
        Promise.resolve(manifest),
        options?.signal,
        "Episode manifest request aborted",
      );
    }

    if (!manifestPromise) {
      const request = requestEpisodeManifest(datasetId, sampleId)
        .then((response) => {
          manifest = response;
          manifestExpiresAtMs = monotonicNowMs() + manifestMaxAgeMs(response);
          // Cleared so the next read past the expiry above resolves again
          if (manifestPromise === request) manifestPromise = null;
          return response;
        })
        .catch((error: unknown) => {
          // Wrapping hides the cause from the tile, which shows only a
          // sentence; the console keeps what actually failed
          console.error(
            "[multimodal] manifest resolve failed",
            { datasetId, sampleId },
            error,
          );
          throw new Error("Unable to resolve episode assets", {
            cause: error,
          });
        });
      manifestPromise = request;
      void request.catch(() => {
        if (manifestPromise === request) manifestPromise = null;
      });
    }

    return awaitCaller(
      manifestPromise,
      options?.signal,
      "Episode manifest request aborted",
    );
  };

  return {
    assets: {
      describeEpisode: async (options) =>
        (await getManifest(options)).episode ?? null,
      list: async (options) =>
        (await getManifest(options)).assets.map((asset) => ({
          ...(asset.feature_name ? { featureName: asset.feature_name } : {}),
          id: asset.asset_id,
          mediaType: asset.media_type,
          metadata: optionalSizeMetadata(asset.size_bytes),
          role: normalizedAssetRole(asset.role),
          selector: normalizeAssetSelector(asset.selector),
        })),
      resolve: async (assetId, options) => {
        const resolvedManifest = await getManifest(options);
        const asset = resolvedManifest.assets.find(
          (candidate) => candidate.asset_id === assetId,
        );
        if (!asset) {
          throw new Error(`Unknown episode asset: ${assetId}`);
        }

        return {
          ...(asset.content_id ? { contentId: asset.content_id } : {}),
          readProfile: normalizedReadProfile(asset.read_profile),
          ...(typeof asset.size_bytes === "number" &&
          Number.isFinite(asset.size_bytes)
            ? {
                sizeBytes: Math.max(0, Math.trunc(asset.size_bytes)).toString(),
              }
            : {}),
          sourceId: asset.asset_id,
          url: asset.url,
        };
      },
    },
    episodeId: mediaReference.key,
    mediaReference,
  };
}

function awaitCaller<T>(
  request: Promise<T>,
  signal: AbortSignal | undefined,
  abortMessage: string,
): Promise<T> {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(createAbortError(abortMessage));

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(createAbortError(abortMessage));
    signal.addEventListener("abort", abort, { once: true });
    void request.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Builds a manifest source for a reference-backed renderer context. */
export function episodeManifestSourceFromContext(
  ctx: SampleRendererProps["ctx"],
): ManifestEpisodeSource | null {
  const mediaReference = ctx.media?.mediaReference;
  if (!mediaReference) return null;

  return episodeSourceFromMediaReference(
    ctx.dataset.datasetId,
    ctx.sample.sample._id,
    mediaReference,
  );
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

function normalizedReadProfile(
  value: string | undefined,
): ByteSourceReadProfile {
  if (
    value === BYTE_SOURCE_READ_PROFILE.LOCAL ||
    value === BYTE_SOURCE_READ_PROFILE.REMOTE
  ) {
    return value;
  }

  // A server too old to say. Remote is the safer of the two to be wrong
  // about: it over-fetches, where local under-caches a read that needs it.
  return BYTE_SOURCE_READ_PROFILE.REMOTE;
}

function optionalSizeMetadata(value: number | undefined): {
  readonly sizeBytes?: string;
} {
  if (value === undefined) {
    return {};
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Episode manifest contains an invalid asset size");
  }

  return { sizeBytes: value.toString() };
}

const LEROBOT_ASSET_ROLES = new Set([
  "dataset-info",
  "dataset-statistics",
  "episode-metadata",
  "image-payload",
  "tabular-frame-data",
  "tasks-metadata",
  "video-stream",
]);

function normalizedAssetRole(value: string): string {
  if (!LEROBOT_ASSET_ROLES.has(value)) {
    throw new Error("Episode manifest contains an unknown asset role");
  }
  return value;
}

function normalizeAssetSelector(selector: unknown): AssetSelectorDescriptor {
  if (!selector || typeof selector !== "object" || !("kind" in selector)) {
    throw new Error("Episode manifest contains a malformed asset selector");
  }
  const value = selector as Record<string, unknown>;
  switch (value.kind) {
    case "whole-file":
      return { kind: "whole-file" };
    case "row-interval":
      if (
        (value.coordinate_system !== "parquet-file-row" &&
          value.coordinate_system !== "lerobot-v3-global-dataset-row") ||
        typeof value.start !== "number" ||
        !Number.isSafeInteger(value.start) ||
        typeof value.end !== "number" ||
        !Number.isSafeInteger(value.end) ||
        value.start < 0 ||
        value.start >= value.end
      ) {
        throw new Error(
          "Episode manifest contains an unsupported row selector",
        );
      }
      return {
        coordinateSystem: value.coordinate_system,
        end: value.end,
        kind: value.kind,
        start: value.start,
      };
    case "video-timestamp-interval":
      if (
        typeof value.from_timestamp !== "number" ||
        !Number.isFinite(value.from_timestamp) ||
        value.from_timestamp < 0 ||
        typeof value.to_timestamp !== "number" ||
        !Number.isFinite(value.to_timestamp) ||
        value.from_timestamp >= value.to_timestamp
      ) {
        throw new Error("Episode manifest contains an invalid video selector");
      }
      return {
        fromTimestamp: value.from_timestamp,
        kind: value.kind,
        toTimestamp: value.to_timestamp,
      };
    default:
      throw new Error("Episode manifest contains an unknown asset selector");
  }
}
