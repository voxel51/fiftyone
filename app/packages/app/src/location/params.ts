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
