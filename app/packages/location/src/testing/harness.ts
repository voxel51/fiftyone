/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Adapter } from "../model";

/**
 * An adapter plus what the `Adapter` interface deliberately does not expose.
 * History depth is the user's, not ours, so it is observable to the
 * conformance suite and to nothing else; `back` is the user pressing Back.
 */
export interface AdapterHarness {
  adapter: Adapter;
  back(): void;
  depth(): number;
}

export const memoryHarness = (initial = "/"): AdapterHarness => {
  const entries = [initial];
  let index = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const back = () => {
    if (index === 0) return;
    index -= 1;
    notify();
  };

  return {
    adapter: {
      back,
      get: () => entries[index],
      push(href) {
        entries.splice(index + 1);
        entries.push(href);
        index = entries.length - 1;
        notify();
      },
      replace(href) {
        entries[index] = href;
        notify();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    back,
    depth: () => entries.length,
  };
};
