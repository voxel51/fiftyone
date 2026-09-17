/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * State carries its key, which is how a test addresses it without a store and
 * how the mock dictionary looks up a stubbed value.
 */
export const named = <S extends object>(
  state: S,
  key: string,
): S & { key: string } =>
  Object.assign(state, { key, debugLabel: key } as const);
