/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Getter } from "jotai";
import { loadableFrom } from "./loadable";
import type { Store } from "./transaction";
import type { ReverbValue, SnapshotInterface } from "./types";

/**
 * Reads are live rather than frozen, so a read taken after an await sees writes
 * that landed in between. Both members are bound so callers may destructure.
 */
export const snapshotFrom = (read: Getter): SnapshotInterface => ({
  getLoadable: <T>(state: ReverbValue<T>) =>
    loadableFrom<T>(() => read(state) as T),
  getPromise: <T>(state: ReverbValue<T>) =>
    Promise.resolve(read(state) as T | Promise<T>),
});

export const snapshot = (store: Store): SnapshotInterface =>
  snapshotFrom(store.get);
