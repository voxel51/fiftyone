import { useMemo } from "react";
import type { HealthNotice } from "./health";
import { createTileRegistry } from "../interaction/registry";

/**
 * Modal-scoped channel for scene-scoped health notices. Producers (3D
 * tiles) publish their already-stabilized notices. Consumers choose the
 * appropriate presentation policy; the settings sidebar omits warnings
 * that already appear in the affected panel.
 */
const registry = createTileRegistry<readonly HealthNotice[]>(
  "EpisodeSceneNotices",
);

export const SceneNoticesProvider = registry.Provider;

/**
 * Publishes a tile's stabilized scene-scoped notices while it is mounted.
 * Pass notices that already went through `useStabilizedNotices` — the
 * registry deliberately does not re-stabilize, so a notice the tile shows
 * is never delayed a second time on its way to the sidebar.
 */
export const usePublishSceneNotices = registry.useRegister;

const EMPTY_NOTICES: readonly HealthNotice[] = [];

/**
 * Every published scene notice, deduplicated by id (first producer wins —
 * two 3D views reporting the same condition is one fact about the scene).
 */
export function useSceneNotices(): readonly HealthNotice[] {
  const entries = registry.useEntries();
  return useMemo(() => {
    if (entries.size === 0) return EMPTY_NOTICES;
    const seen = new Set<string>();
    const union: HealthNotice[] = [];
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
