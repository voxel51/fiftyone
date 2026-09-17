/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { LocationStore } from "./model";

let store: LocationStore<unknown> | undefined;

/**
 * Non-React access, for the inputs that are not clicks: a server-pushed state
 * change, or an operator moving the location. They go through the same store a
 * click does, so there is still one writer.
 */
export const locationBridge = {
  attach<R>(next: LocationStore<R>) {
    store = next as LocationStore<unknown>;
  },

  current<R>(): LocationStore<R> {
    if (!store) throw new Error("location bridge is not attached");
    return store as LocationStore<R>;
  },
};
