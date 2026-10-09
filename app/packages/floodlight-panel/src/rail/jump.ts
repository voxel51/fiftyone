/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OrderSeek } from "../Grid/pageCursors";
import type { Anchor } from "../host/createHost";

/** Item id → offset or sequence, for the items the grid has loaded. */
export interface Offsets {
  get(id: string): number | undefined;
  [Symbol.iterator](): Iterator<[string, number]>;
}

/**
 * One lane's offsets out of records shared by many lanes, where the lane's
 * records are `base + offset` for offsets below `span`.
 */
export const laneOffsets = (
  records: Offsets,
  base: number,
  span: number,
): Offsets => {
  const own = (record: number | undefined) =>
    record !== undefined && record >= base && record < base + span
      ? record - base
      : undefined;
  return {
    get: (id) => own(records.get(id)),
    *[Symbol.iterator]() {
      for (const [id, record] of records) {
        const offset = own(record);
        if (offset !== undefined) yield [id, offset];
      }
    },
  };
};

/**
 * The anchor for a jump to an offset: its page, and the item itself when
 * it is loaded, so the new instance starts on its row.
 */
export const offsetAnchor = (
  offset: number,
  pageSize: number,
  offsets: Offsets,
): Anchor<number> => {
  const key = Math.floor(offset / pageSize);
  for (const [description, at] of offsets) {
    if (at === offset) return { key, at: { description, fraction: 0 } };
  }
  return { key };
};

export type JumpPlan = { anchor: Anchor<number> } | { seek: OrderSeek };

/**
 * A jump to a rail fraction of a value order: in place when the loaded
 * items run across it (the first at or past it, right after one before
 * it), otherwise one seek.
 */
export const fractionJump = (
  fraction: number,
  pageSize: number,
  sequences: Offsets,
  fractions: { get(id: string): number | undefined },
): JumpPlan => {
  const bySequence = new Map<number, number>();
  let target: { id: string; sequence: number } | undefined;
  for (const [id, sequence] of sequences) {
    const at = fractions.get(id);
    if (at === undefined) continue;
    bySequence.set(sequence, at);
    if (at >= fraction && (!target || sequence < target.sequence)) {
      target = { id, sequence };
    }
  }

  const before = target && bySequence.get(target.sequence - 1);
  if (!target || before === undefined || before >= fraction) {
    return { seek: { fraction } };
  }
  return {
    anchor: {
      key: Math.floor(target.sequence / pageSize),
      at: { description: target.id, fraction: 0 },
    },
  };
};
