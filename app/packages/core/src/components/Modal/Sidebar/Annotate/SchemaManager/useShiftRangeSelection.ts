/**
 * Shift-click range selection over a voodo ``RichList``'s checkboxes.
 *
 * The list only reports the selection after a checkbox toggles, so the
 * hook watches ``mousedown`` (capture) on the list's wrapper to learn
 * which row was clicked and whether Shift was held, remembers the last
 * clicked row as the anchor, and — on a Shift-click — extends the
 * toggle to every row between the anchor and the clicked row, in the
 * list's order. Rows are identified by a ``data-cy`` prefix.
 */

import { useCallback, useRef } from "react";

export const useShiftRangeSelection = (
  /** Selectable row ids in display order (across lists sharing the selection). */
  orderedIds: string[],
  setSelected: (ids: string[]) => void,
  /** Row ``data-cy`` prefix, e.g. ``"field-row-"``. */
  rowPrefix: string,
) => {
  const anchorRef = useRef<string | null>(null);
  const pendingRef = useRef<{ id: string; shift: boolean } | null>(null);

  const onMouseDownCapture = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const box = target?.closest?.('[role="checkbox"]');
      const row = box?.closest<HTMLElement>(`[data-cy^="${rowPrefix}"]`);
      const cy = row?.getAttribute("data-cy");
      if (!cy) return;
      pendingRef.current = {
        id: cy.slice(rowPrefix.length),
        shift: event.shiftKey,
      };
      // A shift-click otherwise starts a text selection across rows.
      if (event.shiftKey) event.preventDefault();
    },
    [rowPrefix],
  );

  const onSelected = useCallback(
    (ids: string[]) => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      const anchor = anchorRef.current;
      if (pending) anchorRef.current = pending.id;
      if (pending?.shift && anchor && anchor !== pending.id) {
        const a = orderedIds.indexOf(anchor);
        const b = orderedIds.indexOf(pending.id);
        if (a >= 0 && b >= 0) {
          const range = orderedIds.slice(Math.min(a, b), Math.max(a, b) + 1);
          const checked = ids.includes(pending.id);
          const next = new Set(ids);
          for (const id of range) {
            if (checked) next.add(id);
            else next.delete(id);
          }
          setSelected([...next]);
          return;
        }
      }
      setSelected(ids);
    },
    [orderedIds, setSelected],
  );

  return { onMouseDownCapture, onSelected };
};
