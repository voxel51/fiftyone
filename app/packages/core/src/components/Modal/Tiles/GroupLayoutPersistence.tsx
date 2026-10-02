import { useTiling } from "@fiftyone/tiling";
import { useEffect, useRef } from "react";
import {
  layoutScopeKey,
  writeGroupLayout,
  type SampleLayoutKind,
} from "./layout-persistence";

/** Writes the tile arrangement back to storage whenever it changes. */
export const GroupLayoutPersistence = ({
  datasetId,
  kind,
}: {
  datasetId: string;
  kind: SampleLayoutKind;
}) => {
  const { layout, expandedTileId } = useTiling();
  // The mount value is what we just restored (or the defaults); only
  // user-driven changes are worth a write.
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    writeGroupLayout(
      { layout, expandedTileId: expandedTileId ?? undefined },
      layoutScopeKey(datasetId, kind),
    );
  }, [datasetId, expandedTileId, kind, layout]);

  return null;
};
