import { useScopedSegments } from "@fiftyone/state/src/selection";
import { savedSegmentSource } from "@fiftyone/state/src/selection/segment-provenance";
import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useEffect } from "react";
import {
  registerTileDecorator,
  unregisterTileDecorator,
  type TileDecoratorSample,
} from "../tileDecorators";
import { plural } from "./format";
import { trayTheme } from "./theme";
import styles from "./SelectionTray.module.css";

const ID = "fiftyone:saved-segments";

function SavedSegmentTile({ sample }: { sample: TileDecoratorSample }) {
  const { active, members, loading, error, filtered } = useScopedSegments(
    sample._id ?? sample.id ?? "",
  );
  if (!active) return null;
  const sources = [
    ...new Set(members.map(({ range }) => savedSegmentSource(range).label)),
  ];
  return (
    <div
      className={styles.savedSegments}
      style={trayTheme}
      data-cy="saved-segment-tile"
      title={`${plural(members.length, filtered ? "matching segment" : "saved segment")}${sources.length ? ` — ${sources.join("; ")}` : ""}`}
    >
      <Text
        variant={TextVariant.Xs}
        color={error ? TextColor.Warning : TextColor.Fg}
      >
        {error
          ? "Segments unavailable"
          : loading
            ? "Loading segments…"
            : plural(members.length, "segment")}
      </Text>
    </div>
  );
}

/** Mount the light count badge on all tiles; multimodal owns its range lane. */
export function useSavedSegmentTileDecorator(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    registerTileDecorator({
      id: ID,
      render: (sample) => <SavedSegmentTile sample={sample} />,
    });
    return () => unregisterTileDecorator(ID);
  }, [enabled]);
}
