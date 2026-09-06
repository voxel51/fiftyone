import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo, useRef } from "react";

import type { ByteSourceDescriptor } from "../../ir";
import type { EpisodeSource } from "../../ports";
import { episodeSourceAccessKey } from "../../runtime/episode-resources";
import {
  OSS_SOURCE_FACTS_CACHE_PARTITION,
  type SourceFactsScope,
} from "../../runtime/source-facts";
import { episodeByteSourceFromMediaReference } from "../../runtime/episode-byte-source";
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
  // A reference-backed tile's byte source is the one video the samples page
  // delivered with it; a file-backed sample's is its media path
  const next = mediaReference
    ? episodeByteSourceFromMediaReference(ctx)
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
  // The episode a source serves, and the URL its tile plays, change
  // independently: a re-signed URL is the same episode, so it must not
  // rebuild the session that is reading it
  const episodeKey = mediaReference
    ? JSON.stringify(["media-reference", datasetId, mediaReference.key])
    : "";
  const byteKey = next ? episodeSourceAccessKey(next) : "";
  const ref = useRef<{
    byteKey: string;
    byteSource: ByteSourceDescriptor | null;
    episodeKey: string;
    episodeSource: EpisodeSource | null;
  }>();

  const buildEpisodeSource = () =>
    mediaReference ? episodeManifestSourceFromContext(ctx) : null;
  if (!ref.current) {
    ref.current = {
      byteKey,
      byteSource: next,
      episodeKey,
      episodeSource: buildEpisodeSource(),
    };
  }
  if (ref.current.byteKey !== byteKey) {
    ref.current.byteKey = byteKey;
    ref.current.byteSource = next;
  }
  if (ref.current.episodeKey !== episodeKey) {
    ref.current.episodeKey = episodeKey;
    ref.current.episodeSource = buildEpisodeSource();
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
