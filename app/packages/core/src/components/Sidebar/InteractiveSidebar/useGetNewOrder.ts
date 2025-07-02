import * as fos from "@fiftyone/state";
import { move } from "@fiftyone/utilities";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type { InteractiveItems } from "./types";
import type { Direction } from "./utils";
import { getAfterKey } from "./utils";

export default function useGetNewOrder({
  down,
  isDisabled,
  items,
  lastOrder,
  order,
}: {
  down: MutableRefObject<string | null>;
  isDisabled: (entry: fos.SidebarEntry) => boolean;
  items: MutableRefObject<InteractiveItems>;
  lastOrder: MutableRefObject<string[]>;
  order: MutableRefObject<string[]>;
}) {
  return useCallback(
    (direction: Direction): string[] => {
      let after = getAfterKey(
        down.current,
        items.current,
        lastOrder.current,
        direction,
        isDisabled
      );

      const currentDown = down.current;
      if (!currentDown) {
        throw new Error("no down defined");
      }
      let entry = items.current[currentDown].entry;
      if (currentDown === after && entry.kind === fos.EntryKind.GROUP) {
        const ai = lastOrder.current.indexOf(after) - 1;
        after = ai >= 0 ? lastOrder.current[ai] : null;
      }

      let from = lastOrder.current.indexOf(currentDown);
      let to = after ? lastOrder.current.indexOf(after) : 0;
      if (entry.kind === fos.EntryKind.PATH) {
        to = Math.max(to, 1);
        return move(lastOrder.current, from, to);
      }

      const section: string[] = [];
      do {
        section.push(lastOrder.current[from]);
        from++;

        if (from >= order.current.length) break;

        entry = items.current[lastOrder.current[from]].entry;
      } while (
        entry.kind !== fos.EntryKind.GROUP &&
        entry.kind !== fos.EntryKind.INPUT
      );

      if (after === undefined) {
        return lastOrder.current;
      }

      if (after === null) {
        return [
          ...section,
          ...lastOrder.current.filter((key) => !section.includes(key)),
        ];
      }
      const result: string[] = [];
      const pool = lastOrder.current.filter((key) => !section.includes(key));
      let i = 0;
      let terminate = false;
      while (i < pool.length && !terminate) {
        result.push(pool[i]);
        terminate = pool[i] === after;
        i++;
      }

      return [...result, ...section, ...pool.slice(i)];
    },
    [down, isDisabled, items, lastOrder, order]
  );
}
