/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { loadable } from "./loadable";
import type { Store } from "./transaction";
import type { ReverbValue, SnapshotInterface } from "./types";

/**
 * Reads are live rather than frozen, so a read taken after an await sees writes
 * that landed in between. Both members are bound so callers may destructure.
 */
export const snapshot = (store: Store): SnapshotInterface => ({
  getLoadable: <T>(state: ReverbValue<T>) => loadable(store.get(state) as T),
  getPromise: <T>(state: ReverbValue<T>) =>
    Promise.resolve(store.get(state) as T | Promise<T>),
});
