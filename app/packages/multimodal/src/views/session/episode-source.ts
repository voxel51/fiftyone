import {
  createSampleRendererMediaContext,
  type SampleRendererProps,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";
import { getFetchFunctionExtended } from "@fiftyone/utilities";

import { BYTE_SOURCE_READ_PROFILE, type ByteSourceDescriptor } from "../../ir";
import type {
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
  const manifestUrl = `/dataset/${encodeURIComponent(
    datasetId,
  )}/sample/${encodeURIComponent(sampleId)}/multimodal/manifest`;
  let manifest: TransportMediaAssetManifest | null = null;
  let manifestPromise: Promise<TransportMediaAssetManifest> | null = null;
  const fetchFunction = getFetchFunctionExtended();

  const getManifest = async (
    options?: EpisodeOpenOptions,
  ): Promise<TransportMediaAssetManifest> => {
    if (options?.signal?.aborted) {
      throw createAbortError("Episode manifest request aborted");
    }

    if (manifest) {
      return awaitCaller(
        Promise.resolve(manifest),
        options?.signal,
        "Episode manifest request aborted",
      );
    }

    if (!manifestPromise) {
      const request = fetchFunction<undefined, TransportMediaAssetManifest>({
        method: "GET",
        path: manifestUrl,
        result: "json",
      })
        .then(({ response }) => {
          manifest = response;
          return response;
        })
        .catch((error: unknown) => {
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
      list: async (options) =>
        (await getManifest(options)).assets.map((asset) => ({
          id: asset.asset_id,
          mediaType: asset.media_type,
          role: asset.role,
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
          readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
          sizeBytes:
            typeof asset.size_bytes === "number" &&
            Number.isFinite(asset.size_bytes)
              ? Math.max(0, Math.trunc(asset.size_bytes)).toString()
              : undefined,
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

type TransportMediaAssetManifest = {
  readonly assets: readonly TransportMediaAsset[];
};

type TransportMediaAsset = {
  readonly asset_id: string;
  readonly media_type: string;
  readonly role: string;
  readonly size_bytes: number;
  readonly url: string;
};
