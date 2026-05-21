import { useStore } from "jotai";
import { useCallback } from "react";
import { registeredTilesAtom } from "./atoms";
import type { RegisteredTile } from "./types";

/**
 * Imperative tile-registry API. Domains call `registerTile` to declare
 * a renderable tile kind (one per `type`). The returned function
 * unregisters the entry — call it in a cleanup effect on unmount.
 *
 * Registering the same `type` twice replaces the previous entry so
 * re-registers don't accumulate dupes. The tile itself owns its data
 * binding — tiling never tracks per-tile sources.
 *
 *     const { registerTile } = useTileRegistry();
 *     useEffect(() => {
 *       const dispose = registerTile({
 *         type: "camera",
 *         typeLabel: "Camera",
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
      store.set(registeredTilesAtom, (prev) => [
        ...prev.filter((t) => t.type !== entry.type),
        entry,
      ]);
      return () => {
        store.set(registeredTilesAtom, (prev) =>
          prev.filter((t) => t.type !== entry.type)
        );
      };
    },
    [store]
  );
  return { registerTile };
}
