/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Adapter } from "../model";

/**
 * An adapter plus the two things the `Adapter` interface deliberately does not
 * expose. History depth and going back are the user's, not ours, so they are
 * observable to the conformance suite and to nothing else.
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

  return {
    adapter: {
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
    back() {
      if (index === 0) return;
      index -= 1;
      notify();
    },
    depth: () => entries.length,
  };
};
