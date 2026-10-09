/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Anchor } from "../host/createHost";
import type { JumpTarget } from "./model";

/** Item id → rank, for the items the grid has loaded. */
export interface Ranks {
  get(id: string): number | undefined;
  [Symbol.iterator](): Iterator<[string, number]>;
}

/**
 * One lane's ranks out of records shared by many lanes, where the lane's
 * records are `base + rank` for ranks below `span`.
 */
export const offsetRanks = (
  records: Ranks,
  base: number,
  span: number,
): Ranks => {
  const own = (record: number | undefined) =>
    record !== undefined && record >= base && record < base + span
      ? record - base
      : undefined;
  return {
    get: (id) => own(records.get(id)),
    *[Symbol.iterator]() {
      for (const [id, record] of records) {
        const rank = own(record);
        if (rank !== undefined) yield [id, rank];
      }
    },
  };
};

/**
 * The host anchor for a jump: the target's page, and the target item itself
 * when it is already loaded, so the new instance starts on its row.
 */
export const jumpAnchor = (
  target: JumpTarget,
  ranks: Ranks,
): Anchor<number> => {
  for (const [description, rank] of ranks) {
    if (rank === target.rank) {
      return { key: target.key, at: { description, fraction: 0 } };
    }
  }
  return { key: target.key };
};
