/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Thin wrapper that wires segmentation tool state into the shared
 * ActionToolbar renderer. All state logic lives in useSegmentationActions;
 * all rendering logic lives in ActionToolbar (@fiftyone/components).
 */

import { ActionToolbar } from "@fiftyone/components";
import { Orientation } from "@voxel51/voodo";
import { useSegmentationActions } from "./useSegmentationActions";

// voodoo types the offsets as px numbers, but it handles CSS strings at
// runtime (they go straight to left/top); drop the casts once voodoo widens
// xOffset/yOffset to number | string
const X_OFFSET = "5%" as unknown as number;
const Y_OFFSET = "25%" as unknown as number;

export const SegmentationToolbar = () => {
  const { groups, visible } = useSegmentationActions();

  return (
    <ActionToolbar
      className="segmentation-toolbar"
      groups={groups}
      orientation={Orientation.Column}
      xOffset={X_OFFSET}
      yOffset={Y_OFFSET}
      visible={visible}
    />
  );
};
