import type { useGridSelection } from "@fiftyone/state/src/selection";
import { useCallback, useEffect, useRef } from "react";
import type { Records } from "./useRecords";
import { PAGE_SIZE } from "./constants";

/** Selects a tile, or the inclusive range from its bucket's last selection. */
export type GridSelectionClick = (
  sampleId: string,
  bucketId: string,
  shiftKey: boolean,
) => Promise<void>;

/** Shares per-bucket range anchors between checkboxes, chips, and tile clicks. */
export default function useGridSelectionClick({
  records,
  selection,
  page,
}: {
  records: Records;
  selection: Pick<
    ReturnType<typeof useGridSelection>,
    "domainId" | "scopeKey" | "captures" | "select" | "toggle"
  >;
  page: (index: number) => Promise<unknown>;
}): GridSelectionClick {
  const { domainId, scopeKey } = selection;
  const current = useRef(new Map<string, string>());
  // This effect retires anchors and pending range lookups when the grid's scope changes.
  useEffect(() => {
    current.current = new Map();
    return () => {
      current.current = new Map();
    };
  }, [records, domainId, scopeKey]);

  return useCallback(
    async (sampleId, bucketId, shiftKey) => {
      const anchors = current.current;
      const captured = selection.captures.get(bucketId);
      const anchor = anchors.get(bucketId);
      const from =
        anchor && captured?.has(anchor) ? records.get(anchor) : undefined;
      const to = records.get(sampleId);

      if (shiftKey && from !== undefined && to !== undefined) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        const indices = new Set(records.values());
        const missingPages = new Set<number>();
        for (let index = start; index <= end; index++) {
          if (!indices.has(index))
            missingPages.add(Math.floor(index / PAGE_SIZE));
        }
        for (const index of missingPages) {
          await page(index);
          if (current.current !== anchors) return;
        }
        const ids = [...records]
          .filter(([, index]) => index >= start && index <= end)
          .sort((a, b) => a[1] - b[1])
          .map(([id]) => id);
        // Paging failures are reported by the pager; do not capture a partial range.
        if (ids.length !== end - start + 1) return;
        await selection.select(ids, bucketId);
      } else if (shiftKey) {
        await selection.select([sampleId], bucketId);
      } else {
        await selection.toggle(sampleId, bucketId);
        if (captured?.has(sampleId)) {
          if (anchor === sampleId) anchors.delete(bucketId);
          return;
        }
      }
      anchors.set(bucketId, sampleId);
    },
    [records, selection, page],
  );
}
