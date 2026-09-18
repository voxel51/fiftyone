import { useEffect, useRef } from "react";

import type { ByteSourceDescriptor } from "../../../ir";
import {
  getEpisodeTimeRange,
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
 * A poster-cache hit answers the tile without opening the preview session that
 * would otherwise publish the source's time range, which the tile's overlays
 * need as the domain to place a mark in.
 */
export function useHydratedSourceFacts({
  cachedPoster,
  episodeId,
  previewSessionDemand,
  source,
  sourceFactsScope,
  visible,
}: {
  readonly cachedPoster: GridPosterCacheEntry | null;
  readonly episodeId: string | undefined;
  readonly previewSessionDemand: boolean;
  readonly source: ByteSourceDescriptor | null;
  readonly sourceFactsScope: SourceFactsScope | undefined;
  readonly visible: boolean;
}): void {
  // A tile answered from the poster cache opens no session, so the extent
  // its overlays place marks against is the one the poster carries.
  useEffect(() => {
    const range = cachedPoster?.timeRange;
    if (!episodeId || !range || getEpisodeTimeRange(episodeId)) return;
    publishEpisodeTimeRange(episodeId, range);
  }, [cachedPoster?.timeRange, episodeId]);

  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // A demanded session publishes its own facts on open
    if (!visible || !cachedPoster || previewSessionDemand) return;
    if (!source || !sourceFactsScope) return;
    if (!episodeId) return;
    // The modal writes facts without publishing the shared range, so a tile
    // first seen there has one here but none in the registry
    const bootstrapped = peekSourceBootstrap(source)?.timeRange;
    if (bootstrapped) {
      if (!getEpisodeTimeRange(episodeId)) {
        publishEpisodeTimeRange(episodeId, bootstrapped);
      }
      return;
    }
    const key = sourceBootstrapKey(source);
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    // Not aborted on cleanup: the publish is what a later tile for this source
    // reads, so a scroll-away mid-lookup should still leave the facts behind
    void hydratePersistedSourceFacts(source, sourceFactsScope).then(() => {
      // A preview read also publishes the shared episode range
      const timeRange = peekSourceBootstrap(source)?.timeRange;
      if (timeRange) publishEpisodeTimeRange(episodeId, timeRange);
    });
  }, [
    cachedPoster,
    episodeId,
    previewSessionDemand,
    source,
    sourceFactsScope,
    visible,
  ]);
}
