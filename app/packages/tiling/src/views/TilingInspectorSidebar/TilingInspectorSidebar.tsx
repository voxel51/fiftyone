import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useState } from "react";
import { useTiling } from "../../lib/TilingProvider";
import { useTileSelectionFor } from "../../lib/use-tile-state";
import styles from "./TilingInspectorSidebar.module.css";

type InspectorTab = "explore" | "annotate";

/**
 * Right-hand sidebar with two top-level modes: Explore (current tile
 * inspection) and Annotate (future annotation workflows). Explore is
 * the historical inspector behavior — Annotate is a placeholder until
 * the workflow lands.
 */
const TilingInspectorSidebar: React.FC = () => {
  const [tab, setTab] = useState<InspectorTab>("explore");

  return (
    <div className={styles.root}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "explore"}
          className={clsx(styles.tab, tab === "explore" && styles.tabActive)}
          onClick={() => setTab("explore")}
        >
          Explore
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "annotate"}
          className={clsx(styles.tab, tab === "annotate" && styles.tabActive)}
          onClick={() => setTab("annotate")}
        >
          Annotate
        </button>
      </div>
      <div className={styles.body}>
        {tab === "explore" ? <ExplorePanel /> : <AnnotatePanel />}
      </div>
    </div>
  );
};

const ExplorePanel: React.FC = () => {
  const { focusedTileId } = useTiling();
  const selection = useTileSelectionFor(focusedTileId);

  if (!focusedTileId) {
    return (
      <Text variant={TextVariant.Sm} color={TextColor.Muted}>
        Select a tile to inspect.
      </Text>
    );
  }

  if (selection == null) {
    return (
      <Text variant={TextVariant.Sm} color={TextColor.Muted}>
        Click something inside the tile (a graph sample, a 3D object…) to
        inspect its data.
      </Text>
    );
  }

  return <pre className={styles.json}>{formatSelection(selection)}</pre>;
};

const AnnotatePanel: React.FC = () => (
  <Text variant={TextVariant.Sm} color={TextColor.Muted}>
    Annotation workflows are coming soon.
  </Text>
);

function formatSelection(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export default TilingInspectorSidebar;
