import {
  createSampleRendererMediaContext,
  type SampleRendererProps,
  type SampleRendererSampleLike,
} from "@fiftyone/plugins";
import { getSampleSrc } from "@fiftyone/state";

import { BYTE_SOURCE_READ_PROFILE, type ByteSourceDescriptor } from "../../ir";
import type {
  EpisodeOpenOptions,
  EpisodeSource,
  ManifestEpisodeSource,
  MediaReferenceDescriptor,
  SampleDescriptor,
} from "../../ports";
import { getSourceBootstrap } from "../../runtime";

/** Builds the format-neutral sample facts used by lazy adapter detection. */
export function sampleDescriptorFromContext(
  ctx: SampleRendererProps["ctx"],
): SampleDescriptor {
  return {
    mediaReference: ctx.media.mediaReference,
    mediaType: ctx.media.mediaType ?? ctx.dataset.mediaType,
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
): EpisodeSource {
  const bootstrap = getSourceBootstrap(source);
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
    ...(bootstrap?.manifest ? { manifestHint: bootstrap.manifest } : {}),
    ...(bootstrap?.timeline ? { playbackHint: bootstrap.timeline } : {}),
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

  const getManifest = async (
    options?: EpisodeOpenOptions,
  ): Promise<TransportMediaAssetManifest> => {
    if (manifest) return manifest;

    const response = await fetch(manifestUrl, {
      credentials: "same-origin",
      signal: options?.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Unable to resolve episode assets (${response.status} ${response.statusText})`,
      );
    }

    manifest = (await response.json()) as TransportMediaAssetManifest;
    return manifest;
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
          sizeBytes: Math.max(0, Math.trunc(asset.size_bytes)).toString(),
          sourceId: asset.asset_id,
          url: asset.url,
        };
      },
    },
    episodeId: mediaReference.key,
    mediaReference,
  };
}

/** Builds a manifest source for a reference-backed renderer context. */
export function episodeManifestSourceFromContext(
  ctx: SampleRendererProps["ctx"],
): ManifestEpisodeSource | null {
  const mediaReference = ctx.media.mediaReference;
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
