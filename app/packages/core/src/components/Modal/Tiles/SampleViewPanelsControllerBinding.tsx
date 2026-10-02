import * as fos from "@fiftyone/state";
import { useTiling } from "@fiftyone/tiling";
import { useEffect, useRef } from "react";
import {
  createPanelTile,
  isPanelTileType,
  panelNameFromTileType,
  panelTileType,
} from "./panel-tiles";

/**
 * Publishes the host's panel operations (open / close / list) for the
 * `open_panel`, `close_panel` and `list_open_panels` operators while the
 * host is mounted.
 */
export const SampleViewPanelsControllerBinding = () => {
  const tiling = useTiling();
  const tilingRef = useRef(tiling);
  tilingRef.current = tiling;
  // Written straight to the app's Jotai store: the operators read it with
  // plain hooks against that same store.
  const setController = (
    controller: fos.SampleViewPanelsController | null,
  ): void => {
    fos.jotaiStore.set(fos.sampleViewPanelsControllerAtom, controller);
  };

  useEffect(() => {
    const list = (): fos.SampleViewPanelTile[] =>
      Object.entries(tilingRef.current.tiles)
        .filter(([, tile]) => tile.type && isPanelTileType(tile.type))
        .map(([id, tile]) => ({
          id,
          name: panelNameFromTileType(tile.type ?? "") ?? "",
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    setController({
      list,
      open: (name, options) => {
        const { addTile, setFocusedTileId } = tilingRef.current;
        const focus = options?.focus ?? true;
        if (!options?.allowDuplicate) {
          const existing = list().find((tile) => tile.name === name);
          if (existing) {
            if (focus) setFocusedTileId(existing.id);
            return existing.id;
          }
        }
        return addTile(createPanelTile(name, options?.label), {
          idPrefix: panelTileType(name),
          focus,
        });
      },
      close: ({ id, name }) => {
        const match = list().find(
          (tile) => (id && tile.id === id) || (!id && tile.name === name),
        );
        if (!match) return false;
        tilingRef.current.removeTile(match.id);
        return true;
      },
    });
    return () => {
      setController(null);
    };
    // setController is a stable module-store write
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};
