/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { defineParam } from "@fiftyone/location";

/** `?slice=<name>`: the group slice on screen. A slice change replaces. */
export const sliceParam = defineParam<string | undefined>({
  key: "slice",
  parse: (raw) => raw || undefined,
  format: (slice) => slice || undefined,
  history: "replace",
  scope: "dataset",
});

/**
 * `?id=<sample>` / `?groupId=<group>`: the sample on screen, a group's by its
 * group. `writeModal` picks each write's history, so these policies are
 * only the fallback for a bare `write`.
 */
export const sampleIdParam = defineParam<string | undefined>({
  key: "id",
  parse: (raw) => raw || undefined,
  format: (id) => id || undefined,
  history: "push",
  scope: "dataset",
});

export const groupIdParam = defineParam<string | undefined>({
  key: "groupId",
  parse: (raw) => raw || undefined,
  format: (id) => id || undefined,
  history: "push",
  scope: "dataset",
});
