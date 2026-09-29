/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

type Stamped = { last_modified_at?: unknown; tags?: unknown };

// a write bumps `last_modified_at`; older documents fall back to their tags
const stamp = (sample: object) => {
  const { last_modified_at, tags } = sample as Stamped;
  return JSON.stringify(last_modified_at ?? tags ?? null);
};

/** Whether a refetched sample differs from the one an item was built with. */
export const sampleChanged = (held: object, next: object) =>
  held !== next && stamp(held) !== stamp(next);
