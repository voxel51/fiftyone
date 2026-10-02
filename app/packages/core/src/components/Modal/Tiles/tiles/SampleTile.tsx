import { Loading } from "@fiftyone/components";
import { Suspense } from "react";
import Group from "../../Group";

/**
 * The whole existing group tree in one tile. Used for dynamic groups, whose
 * paginator / carousel / nested-group layout stays exactly as it is today.
 */
export const SampleTile = () => (
  <Suspense fallback={<Loading>Pixelating...</Loading>}>
    <Group />
  </Suspense>
);
