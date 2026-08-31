import { useEffect, useRef } from "react";

import type { ByteSourceDescriptor } from "../../../ir";
import {
  hydratePersistedSourceFacts,
  peekSourceBootstrap,
  publishEpisodeTimeRange,
  sourceBootstrapKey,
  type SourceFactsScope,
} from "../../../runtime";
import type { GridPosterCacheEntry } from "./grid-poster-cache";

/**
 * Republishes a cached tile's persisted source facts.
 *
 * A poster-cache hit answers the tile without opening a preview session, and
 * that read is the only thing that publishes the recording's own time range.
 * Without it the temporal-tag lane scales its marks against the last tag's end
 * instead, so a tile served from cache draws them at the wrong offsets.
 */
export function useHydratedSourceFacts({
  cachedPoster,
  previewSessionDemand,
  source,
  sourceFactsScope,
  visible,
}: {
  readonly cachedPoster: GridPosterCacheEntry | null;
  readonly previewSessionDemand: boolean;
  readonly source: ByteSourceDescriptor | null;
  readonly sourceFactsScope: SourceFactsScope | undefined;
  readonly visible: boolean;
}): void {
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // A demanded session publishes its own facts on open
    if (!visible || !cachedPoster || previewSessionDemand) return;
    if (!source || !sourceFactsScope) return;
    if (peekSourceBootstrap(source)?.timeRange) return;
    const key = sourceBootstrapKey(source);
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    // Not aborted on cleanup: the publish is what a later tile for this source
    // reads, so a scroll-away mid-lookup should still leave the facts behind
    void hydratePersistedSourceFacts(source, sourceFactsScope).then(() => {
      // The durable lane is published wholesale and leaves the shared episode
      // range alone; a preview read publishes both, and the temporal-tag lane
      // scales its marks against that one
      const timeRange = peekSourceBootstrap(source)?.timeRange;
      if (timeRange) publishEpisodeTimeRange(source.sourceId, timeRange);
    });
  }, [cachedPoster, previewSessionDemand, source, sourceFactsScope, visible]);
}
