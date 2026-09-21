/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Getter, Setter } from "jotai";
import { DEFAULT_VALUE, DefaultValue } from "./sentinel";
import type { TransactionInterface, Write } from "./types";

/** Resolves the updater form of a write against the current value. */
export const resolve = <T>(
  next: Write<T>,
  current: () => T,
): T | DefaultValue =>
  typeof next === "function"
    ? (next as (previous: T) => T | DefaultValue)(current())
    : next;

/**
 * A reset writes the sentinel rather than restoring a value, so each state's
 * own writer decides what its reset means.
 */
export const accessors = (get: Getter, set: Setter): TransactionInterface => ({
  get: (state) => get(state),
  set: (state, next) => set(state, next),
  reset: (state) => set(state, DEFAULT_VALUE),
});
