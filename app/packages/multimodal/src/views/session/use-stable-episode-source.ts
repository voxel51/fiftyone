import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo, useRef } from "react";

import { BYTE_SOURCE_READ_PROFILE, type ByteSourceDescriptor } from "../../ir";
import type { EpisodeSource } from "../../ports";
import { episodeSourceAccessKey } from "../../runtime/episode-resources";
import {
  OSS_SOURCE_FACTS_CACHE_PARTITION,
  type SourceFactsScope,
} from "../../runtime/source-facts";
import {
  episodeByteSourceFromContext,
  episodeManifestSourceFromContext,
  episodeSourceFromByteSource,
} from "./episode-source";

/** Stable physical and logical source identities for the active episode. */
export function useStableEpisodeSource(ctx: SampleRendererProps["ctx"]): {
  readonly byteSource: ByteSourceDescriptor | null;
  readonly episodeSource: EpisodeSource | null;
  readonly sourceFactsScope: SourceFactsScope | undefined;
} {
  const datasetId = ctx.dataset.datasetId;
  const mediaField = ctx.media?.field ?? null;
  const mediaReference = ctx.media?.mediaReference;
  const next = mediaReference
    ? {
        readProfile: BYTE_SOURCE_READ_PROFILE.REMOTE,
        sourceId: mediaReference.key,
        url: `/dataset/${encodeURIComponent(
          datasetId,
        )}/sample/${encodeURIComponent(
          ctx.sample.sample._id,
        )}/multimodal/manifest`,
      }
    : episodeByteSourceFromContext(ctx);
  const sourceFactsScope = useMemo(
    () =>
      mediaReference
        ? undefined
        : {
            cachePartition: OSS_SOURCE_FACTS_CACHE_PARTITION,
            datasetId,
            mediaField,
          },
    [datasetId, mediaField, mediaReference],
  );
  const sourceKey = mediaReference
    ? JSON.stringify([
        "media-reference",
        datasetId,
        ctx.sample.sample._id,
        mediaReference.kind,
        mediaReference.key,
      ])
    : next
      ? episodeSourceAccessKey(next)
      : "";
  const ref = useRef<{
    readonly byteSource: ByteSourceDescriptor | null;
    readonly episodeSource: EpisodeSource | null;
    readonly sourceKey: string;
  }>();

  if (!ref.current || ref.current.sourceKey !== sourceKey) {
    ref.current = {
      byteSource: next,
      episodeSource: mediaReference
        ? episodeManifestSourceFromContext(ctx)
        : null,
      sourceKey,
    };
  }
  const byteSource = ref.current.byteSource;
  const manifestSource = ref.current.episodeSource;
  const episodeSource = useMemo(
    () =>
      manifestSource ??
      (byteSource && sourceFactsScope
        ? episodeSourceFromByteSource(byteSource, sourceFactsScope)
        : null),
    [byteSource, manifestSource, sourceFactsScope],
  );
  return { byteSource, episodeSource, sourceFactsScope };
}
