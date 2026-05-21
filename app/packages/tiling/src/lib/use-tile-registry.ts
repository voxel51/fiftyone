import { useStore } from "jotai";
import { useCallback } from "react";
import { registeredTilesAtom } from "./atoms";
import type { RegisteredTile } from "./types";

/**
 * Register a tile kind (one per `type`). Returns a disposer; call it
 * from a cleanup effect. Re-registering the same `type` replaces the
 * previous entry.
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
