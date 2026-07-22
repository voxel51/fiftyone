import { useMemo } from "react";
import type { EpisodeHealthNotice } from "./episode-health";
import { createEpisodeTileRegistry } from "../interaction/registry";

/**
 * Modal-scoped channel for scene-scoped health notices. Producers (3D
 * tiles) publish their already-stabilized notices; the sidebar's Scene tab
 * renders the union, so scene health reads the same everywhere it appears.
 */
const registry = createEpisodeTileRegistry<readonly EpisodeHealthNotice[]>(
  "EpisodeSceneNotices",
);

export const EpisodeSceneNoticesProvider = registry.Provider;

/**
 * Publishes a tile's stabilized scene-scoped notices while it is mounted.
 * Pass notices that already went through `useStabilizedEpisodeNotices` — the
 * registry deliberately does not re-stabilize, so a notice the tile shows
 * is never delayed a second time on its way to the sidebar.
 */
export const usePublishEpisodeSceneNotices = registry.useRegister;

const EMPTY_NOTICES: readonly EpisodeHealthNotice[] = [];

/**
 * Every published scene notice, deduplicated by id (first producer wins —
 * two 3D views reporting the same condition is one fact about the scene).
 */
export function useEpisodeSceneNotices(): readonly EpisodeHealthNotice[] {
  const entries = registry.useEntries();
  return useMemo(() => {
    if (entries.size === 0) return EMPTY_NOTICES;
    const seen = new Set<string>();
    const union: EpisodeHealthNotice[] = [];
    for (const notices of entries.values()) {
      for (const notice of notices) {
        if (notice.scope !== "scene" || seen.has(notice.id)) continue;
        seen.add(notice.id);
        union.push(notice);
      }
    }
    return union.length > 0 ? union : EMPTY_NOTICES;
  }, [entries]);
}
