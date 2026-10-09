/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Loadable } from "@fiftyone/reverb";
import type { ModalPositions } from "../atoms/modal";

/** Above this many samples no position shows: an exact count scales with N */
export const EXACT_POSITION_LIMIT = 2_000_000;

/** The order's length, when it is an exact count already in hand. */
export const exactTotal = (
  count: Loadable<number> | undefined,
  estimate: boolean,
): number | undefined => {
  const total = count?.valueMaybe();

  return !estimate && typeof total === "number" && total < EXACT_POSITION_LIMIT
    ? total
    : undefined;
};

/** Offsets of the samples stepped to, each one step from the last. */
export const trackPositions = (total: number, key: string, offset: number) => {
  const offsets = new Map([[key, offset]]);
  let current = offset;

  const positions: ModalPositions = {
    total,
    offsetOf: (at) => offsets.get(at),
  };

  return {
    positions,
    stepped: (at: string, by: number) => {
      current += by;
      offsets.set(at, current);
    },
  };
};
