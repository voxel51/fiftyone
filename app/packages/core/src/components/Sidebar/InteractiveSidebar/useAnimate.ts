import * as fos from "@fiftyone/state";
import type { Controller } from "@react-spring/web";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type { InteractiveItems } from "./types";
import type useGetNewOrder from "./useGetNewOrder";
import { Direction, MARGIN, fn } from "./utils";

export default function useAnimate({
  down,
  getNewOrder,
  items,
  last,
  lastDirection,
  lastOrder,
  order,
  start,
  controller,
}: {
  down: MutableRefObject<string | null>;
  getNewOrder: ReturnType<typeof useGetNewOrder>;
  items: MutableRefObject<InteractiveItems>;
  last: MutableRefObject<number | null>;
  lastDirection: MutableRefObject<Direction | null>;
  lastOrder: MutableRefObject<string[]>;
  order: MutableRefObject<string[]>;
  start: MutableRefObject<number | null>;
  controller: Controller;
}) {
  return useCallback(
    (y) => {
      if (down.current == null) return;
      document.getSelection()?.removeAllRanges();
      const entry = items.current[down.current].entry;

      const d = y - (last.current ?? 0);

      if (d > 0) {
        lastDirection.current = Direction.DOWN;
      } else if (d < 0 || !lastDirection.current) {
        lastDirection.current = Direction.UP;
      }

      if (![fos.EntryKind.PATH, fos.EntryKind.GROUP].includes(entry.kind))
        return;
      const realDelta = y - (start.current ?? 0);
      const newOrder = getNewOrder(lastDirection.current);
      const { results, minHeight } = fn(
        items.current,
        order.current,
        newOrder,
        down.current,
        realDelta
      );
      controller.set({ minHeight: minHeight + MARGIN });

      for (const key of order.current)
        items.current[key].controller.start(results[key]);

      last.current = y;
      lastOrder.current = newOrder;
    },
    [
      controller,
      down,
      getNewOrder,
      items,
      last,
      lastDirection,
      lastOrder,
      order,
      start,
    ]
  );
}
