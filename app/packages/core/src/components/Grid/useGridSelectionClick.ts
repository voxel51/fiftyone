import type { useGridSelection } from "@fiftyone/state/src/selection";
import { useCallback, useEffect, useRef } from "react";
import type { Records } from "./useRecords";
import { PAGE_SIZE } from "./constants";

/**
 * Picks a tile into the active section, or with Shift the inclusive range
 * from the last pick.
 */
export type GridSelectionClick = (
  sampleId: string,
  shiftKey: boolean,
) => Promise<void>;

/** Shares range anchors between checkboxes, section marks, and tile clicks. */
export default function useGridSelectionClick({
  records,
  selection,
  page,
}: {
  records: Records;
  selection: Pick<
    ReturnType<typeof useGridSelection>,
    "domainId" | "scopeKey" | "captures" | "active" | "select" | "toggle"
  >;
  page: (index: number) => Promise<unknown>;
}): GridSelectionClick {
  const { domainId, scopeKey } = selection;
  // One anchor per section, so a range continues where that section left off.
  const current = useRef(
    new Map<string, { id: string; index?: number; revision?: number }>(),
  );
  // This effect retires anchors and pending range lookups when the grid's scope changes.
  useEffect(() => {
    current.current = new Map();
    return () => {
      current.current = new Map();
    };
  }, [records, domainId, scopeKey]);

  return useCallback(
    async (sampleId, shiftKey) => {
      const anchors = current.current;
      const key = selection.active;
      const picked = (id: string) =>
        Boolean(selection.captures.get(key)?.has(id));
      const anchor = anchors.get(key);
      const from =
        anchor && picked(anchor.id) && anchor.revision === records.revision
          ? anchor.index
          : undefined;
      const to = records.get(sampleId);

      if (shiftKey && from !== undefined && to !== undefined) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        // Gather requested IDs independently of the bounded navigation cache.
        // Loading a long range must not evict its beginning from this operation.
        const range = new Map(
          [...records].filter(([, index]) => index >= start && index <= end),
        );
        const indices = new Set(range.values());
        const missingPages = new Set<number>();
        for (let index = start; index <= end; index++) {
          if (!indices.has(index))
            missingPages.add(Math.floor(index / PAGE_SIZE));
        }
        for (const index of missingPages) {
          await page(index);
          if (current.current !== anchors) return;
          if (anchor?.revision !== records.revision) return;
          for (const [id, position] of records)
            if (position >= start && position <= end) range.set(id, position);
        }
        const ids = [...range]
          .filter(([, index]) => index >= start && index <= end)
          .sort((a, b) => a[1] - b[1])
          .map(([id]) => id);
        // Paging failures are reported by the pager; do not capture a partial range.
        if (ids.length !== end - start + 1) return;
        await selection.select(ids);
      } else if (shiftKey) {
        await selection.select([sampleId]);
      } else {
        const wasPicked = picked(sampleId);
        await selection.toggle(sampleId);
        if (wasPicked) {
          if (anchor?.id === sampleId) anchors.delete(key);
          return;
        }
      }
      anchors.set(key, { id: sampleId, index: to, revision: records.revision });
    },
    [records, selection, page],
  );
}
