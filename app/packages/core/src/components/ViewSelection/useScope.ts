/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLoadedViewName, useViewCount } from "@fiftyone/state";

/**
 * What the samples on screen are: the loaded saved query's name, if any, and
 * how many samples the view and filters hold.
 */
export default function useScope(): {
  name: string | null;
  total: number | null;
} {
  return { name: useLoadedViewName(), total: useViewCount() };
}
