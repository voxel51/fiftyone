import { useStore } from "jotai";
import { useCallback } from "react";
import { registeredTilesAtom } from "./atoms";
import type { RegisteredTile } from "./types";

/**
 * Imperative tile-registry API. The integration layer (the code that
 * knows about your data sources — playback streams, server feeds,
 * whatever) calls `registerTile` for each spawnable source. The
 * returned function unregisters the entry — call it in a cleanup
 * effect on unmount.
 *
 * Tiling owns the registry; data layers don't have to know it exists.
 * UIs that consume the registry use `useTileTypes` (deduped) or
 * `useTileSourcesByType(type)` (filtered).
 *
 *     const { registerTile } = useTileRegistry();
 *     useEffect(() => {
 *       const dispose = registerTile({
 *         streamId: "camera_front",
 *         type: "camera",
 *         typeLabel: "Camera",
 *         title: "Camera front",
 *         icon: IconName.GridView,
 *         Tile: CameraTile,
 *       });
 *       return dispose;
 *     }, [registerTile]);
 */
export function useTileRegistry(): {
  registerTile: (entry: RegisteredTile) => () => void;
} {
  const store = useStore();
  const registerTile = useCallback(
    (entry: RegisteredTile) => {
      // Replace any existing entry with the same streamId so re-registers
      // don't accumulate dupes.
      store.set(registeredTilesAtom, (prev) => [
        ...prev.filter((t) => t.streamId !== entry.streamId),
        entry,
      ]);
      return () => {
        store.set(registeredTilesAtom, (prev) =>
          prev.filter((t) => t.streamId !== entry.streamId)
        );
      };
    },
    [store]
  );
  return { registerTile };
}
