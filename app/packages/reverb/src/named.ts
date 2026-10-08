/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Marks a value as Reverb state, so a plain object is never mistaken for it.
 * Registered globally rather than unique, so the mark still matches when two
 * copies of this package are loaded — plugin bundles and a reset module
 * registry both produce that.
 */
export const REVERB = Symbol.for("@fiftyone/reverb");

/**
 * State carries its key, which is how a test addresses it without a store and
 * how the mock dictionary looks up a stubbed value.
 */
export const named = <S extends object>(
  state: S,
  key: string,
): S & { key: string; [REVERB]: true } =>
  Object.assign(state, { key, debugLabel: key, [REVERB]: true as const });

export const isReverb = (value: unknown): boolean =>
  typeof value === "object" && value !== null && REVERB in value;
