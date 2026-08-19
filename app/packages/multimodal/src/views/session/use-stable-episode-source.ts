import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo, useRef } from "react";

import type { ByteSourceDescriptor } from "../../ir";
import type { EpisodeSource } from "../../ports";
import {
  episodeSourceAccessKey,
  OSS_SOURCE_FACTS_CACHE_PARTITION,
  type SourceFactsScope,
} from "../../runtime";
import {
  episodeByteSourceFromContext,
  episodeSourceFromByteSource,
} from "./episode-source";

/** Stable physical and logical source identities for the active episode. */
export function useStableEpisodeSource(ctx: SampleRendererProps["ctx"]): {
  readonly byteSource: ByteSourceDescriptor | null;
  readonly episodeSource: EpisodeSource | null;
  readonly sourceFactsScope: SourceFactsScope;
} {
  const next = episodeByteSourceFromContext(ctx);
  const datasetId = ctx.dataset.datasetId;
  const mediaField = ctx.media?.field ?? null;
  const sourceFactsScope = useMemo(
    () => ({
      cachePartition: OSS_SOURCE_FACTS_CACHE_PARTITION,
      datasetId,
      mediaField,
    }),
    [datasetId, mediaField],
  );
  const sourceKey = next ? episodeSourceAccessKey(next) : "";
  const ref = useRef<{
    readonly byteSource: ByteSourceDescriptor | null;
    readonly sourceKey: string;
  }>();

  if (!ref.current || ref.current.sourceKey !== sourceKey) {
    ref.current = { byteSource: next, sourceKey };
  }
  const byteSource = ref.current.byteSource;
  const episodeSource = useMemo(
    () =>
      byteSource
        ? episodeSourceFromByteSource(byteSource, sourceFactsScope)
        : null,
    [byteSource, sourceFactsScope],
  );
  return { byteSource, episodeSource, sourceFactsScope };
}
