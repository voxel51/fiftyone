import { useTiling } from "@fiftyone/tiling";
import { useEffect, useRef } from "react";
import { writeGroupLayout } from "./layout-persistence";

/** Writes the tile arrangement back to storage whenever it changes. */
export const GroupLayoutPersistence = ({
  datasetId,
}: {
  datasetId: string;
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
      datasetId,
    );
  }, [datasetId, expandedTileId, layout]);

  return null;
};
