import {
  resolveSamplePosition,
  type SelectionRequest,
} from "@fiftyone/state/src/selection";
import { useCallback, useRef } from "react";
import type { Records } from "./useRecords";
import { PAGE_SIZE } from "./constants";

/**
 * Scrolls the grid to a sample by anchoring a rebuild on its page, the way
 * the grid returns to its last location after the modal closes. The index
 * comes from the pages already fetched when the sample has been seen in
 * this view, and from the server otherwise, so nothing pages toward it.
 * Resolves false when the current results do not show the sample.
 */
export default function useGridJump({
  records,
  datasetId,
  request,
  anchor,
}: {
  records: Records;
  datasetId: string;
  request: SelectionRequest;
  /** Writes the grid location, from `useScrollLocation`. */
  anchor: (location: { page: number; at: string }) => void;
}) {
  // A view change replaces the records; a lookup that started before it
  // must not land the new view on a page from the old one.
  const current = useRef(records);
  current.current = records;
  return useCallback(
    async (sampleId: string) => {
      let index = records.get(sampleId);
      if (index === undefined) {
        const position = await resolveSamplePosition(datasetId, {
          ...request,
          sampleId,
        });
        if (position.index === null || current.current !== records)
          return false;
        index = position.index;
      }
      anchor({ page: Math.floor(index / PAGE_SIZE), at: sampleId });
      return true;
    },
    [records, datasetId, request, anchor],
  );
}
