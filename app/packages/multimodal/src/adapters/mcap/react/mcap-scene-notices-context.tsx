import { useMemo } from "react";
import type { McapHealthNotice } from "./mcap-health";
import { createMcapTileRegistry } from "./mcap-tile-registry";

/**
 * Modal-scoped channel for scene-scoped health notices. Producers (3D
 * tiles) publish their already-stabilized notices; the sidebar's Scene tab
 * renders the union, so scene health reads the same everywhere it appears.
 */
const registry =
  createMcapTileRegistry<readonly McapHealthNotice[]>("McapSceneNotices");

export const McapSceneNoticesProvider = registry.Provider;

/**
 * Publishes a tile's stabilized scene-scoped notices while it is mounted.
 * Pass notices that already went through `useStabilizedMcapNotices` — the
 * registry deliberately does not re-stabilize, so a notice the tile shows
 * is never delayed a second time on its way to the sidebar.
 */
export const usePublishMcapSceneNotices = registry.useRegister;

const EMPTY_NOTICES: readonly McapHealthNotice[] = [];

/**
 * Every published scene notice, deduplicated by id (first producer wins —
 * two 3D views reporting the same condition is one fact about the scene).
 */
export function useMcapSceneNotices(): readonly McapHealthNotice[] {
  const entries = registry.useEntries();
  return useMemo(() => {
    if (entries.size === 0) return EMPTY_NOTICES;
    const seen = new Set<string>();
    const union: McapHealthNotice[] = [];
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
