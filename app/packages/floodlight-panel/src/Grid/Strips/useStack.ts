/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Drives one stack's model: pages come from the cell's shared source,
 * requested ahead of the front while the stack is near the viewport.
 */

import type { ItemData } from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CellSource } from "./cellSource";
import {
  beginPage,
  emptyStack,
  failPage,
  pageToLoad,
  receivePage,
  seekStack,
  type StackState,
  stepStack,
} from "./stackModel";

export type StackItemData = ItemData<number, fos.Sample>;
type State = StackState<StackItemData>;

export default function useStack(source: CellSource, active: boolean) {
  const store = useRef<{ source: CellSource; state: State }>();
  if (store.current?.source !== source) {
    store.current = { source, state: emptyStack() };
  }
  const [, render] = useReducer((n: number) => n + 1, 0);

  // results for a replaced source are dropped
  const update = useCallback(
    (from: CellSource, change: (state: State) => State) => {
      const current = store.current;
      if (!current || current.source !== from) return current?.state;
      const next = change(current.state);
      if (next !== current.state) {
        current.state = next;
        render();
      }
      return next;
    },
    [],
  );

  const state = store.current.state;
  const due = active ? pageToLoad(state) : null;

  useEffect(() => {
    if (due === null) return;
    update(source, beginPage);
    source.get(due).then(
      (page) =>
        update(source, (s) => receivePage(s, due, page.items, page.next)),
      () => update(source, failPage),
    );
  }, [due, source, update]);

  const step = useCallback(
    (delta: number) => update(source, (s) => stepStack(s, delta)),
    [source, update],
  );

  /** Loads through `page` if needed, then brings `description` to the front. */
  const seek = useCallback(
    async (description: string, page: number) => {
      const has = (s: State) =>
        s.entries.some((e) => e.item.id.description === description);
      let current = store.current?.state;
      while (
        current &&
        store.current?.source === source &&
        !has(current) &&
        current.next !== null &&
        current.next <= page
      ) {
        const key = current.next;
        update(source, beginPage);
        try {
          const result = await source.get(key);
          current = update(source, (s) =>
            receivePage(s, key, result.items, result.next),
          );
        } catch {
          current = update(source, failPage);
        }
      }
      return update(source, (s) => seekStack(s, description));
    },
    [source, update],
  );

  return { seek, state, step };
}
