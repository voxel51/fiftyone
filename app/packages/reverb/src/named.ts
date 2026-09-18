/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** Marks a value as Reverb state, so a plain object is never mistaken for it. */
export const REVERB = Symbol.for("@fiftyone/reverb");

/**
 * State carries its key, which is how a test addresses it without a store and
 * how the mock dictionary looks up a stubbed value.
 */
export const named = <S extends object>(
  state: S,
  key: string,
): S & { key: string } =>
  Object.assign(state, { key, debugLabel: key, [REVERB]: true } as const);

export const isReverb = (value: unknown): boolean =>
  typeof value === "object" && value !== null && REVERB in value;
