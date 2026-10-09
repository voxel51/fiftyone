/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ValueCount } from "../categorical";
import { keyOf } from "./matrixLayout";
import type { RowStore } from "./rowPages";
import MatrixRow from "./MatrixRow";

/** Renders each row Floodlight shows into its tile. */
export default function MatrixRows({
  rows,
  store,
}: {
  rows: ValueCount[];
  store: RowStore;
}) {
  const shown = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const indices = useMemo(
    () => new Map(rows.map((row, index) => [keyOf(row), index])),
    [rows],
  );

  return (
    <>
      {[...shown].map(([key, row]) => {
        const index = indices.get(key);
        return index === undefined
          ? null
          : createPortal(
              <MatrixRow height={row.height} index={index} />,
              row.element,
              key,
            );
      })}
    </>
  );
}
