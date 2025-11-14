import type { SidebarEntry } from "@fiftyone/state";
import { useEventHandler } from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type { InteractiveItems } from "./types";
import type useGetNewOrder from "./useGetNewOrder";
import type { Direction } from "./utils";

export default function useExit({
  cb,
  down,
  getNewOrder,
  items,
  lastDirection,
  lastTouched,
  order,
  start,
  setEntries,
}: {
  cb: MutableRefObject<(() => void) | null>;
  down: MutableRefObject<string | null>;
  getNewOrder: ReturnType<typeof useGetNewOrder>;
  items: MutableRefObject<InteractiveItems>;
  last: MutableRefObject<number | null>;
  lastDirection: MutableRefObject<Direction | null>;
  lastTouched: MutableRefObject<string | null>;
  order: MutableRefObject<string[]>;
  setEntries: (entries: SidebarEntry[]) => void;
  start: MutableRefObject<number | null>;
}) {
  const exit = useCallback(() => {
    if (down.current === null) {
      start.current = null;
      cb.current = null;
      return;
    }

    requestAnimationFrame(() => {
      cb.current?.();

      lastTouched.current = down.current;
      if (!lastDirection.current) return;
      const newOrder = getNewOrder(lastDirection.current);
      order.current = newOrder;

      const newEntries = order.current.map((key) => items.current[key].entry);

      cb.current = null;
      down.current = null;
      start.current = null;
      lastDirection.current = null;

      setEntries(newEntries);
    });
  }, [
    cb,
    down,
    getNewOrder,
    items,
    lastDirection,
    lastTouched,
    order,
    start,
    setEntries,
  ]);

  useEventHandler(document.body, "mouseup", exit);
  useEventHandler(document.body, "mouseleave", exit);
}
