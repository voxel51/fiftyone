import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React from "react";
import { tileSelectionAtom } from "../../lib/playback/atoms";
import { useTiling } from "../../lib/TilingProvider";
import SidebarPanel from "../SidebarPanel/SidebarPanel";
import styles from "./TilingInspectorSidebar.module.css";

/**
 * Right-hand sidebar that shows the focused tile's current "selection"
 * — whatever the tile body wrote into `tileSelectionAtom(tileId)` when
 * the user clicked an inspectable element (a graph sample, a 3D scene
 * object, …). Each tile defines its own payload shape; we render the
 * payload as syntax-colored JSON so any structure displays sensibly.
 */
const TilingInspectorSidebar: React.FC = () => {
  const { focusedTileId, tiles } = useTiling();
  const focusedTile = focusedTileId ? tiles[focusedTileId] : null;
  // atomFamily wants a non-empty key — `""` is fine; the atom just
  // never holds anything meaningful for an "absent" tile.
  const selection = useAtomValue(tileSelectionAtom(focusedTileId ?? ""));

  if (!focusedTileId) {
    return (
      <SidebarPanel title="Inspector">
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Select a tile to inspect.
        </Text>
      </SidebarPanel>
    );
  }

  return (
    <SidebarPanel title="Inspector">
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Focused tile
      </Text>
      <Text variant={TextVariant.Sm} color={TextColor.Primary}>
        {focusedTile?.title ?? focusedTileId}
      </Text>

      <div className={styles.spacer} />

      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Selection
      </Text>
      {selection ? (
        <pre className={styles.json}>{formatSelection(selection)}</pre>
      ) : (
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Click something inside the tile (a graph sample, a 3D
          object…) to inspect its data.
        </Text>
      )}
    </SidebarPanel>
  );
};

function formatSelection(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default TilingInspectorSidebar;
