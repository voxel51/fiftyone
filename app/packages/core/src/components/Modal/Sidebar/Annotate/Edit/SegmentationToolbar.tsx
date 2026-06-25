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

export const SegmentationToolbar = () => {
  const { groups, visible } = useSegmentationActions();

  return (
    <ActionToolbar
      className="segmentation-toolbar"
      groups={groups}
      orientation={Orientation.Column}
      xOffset="5%"
      yOffset="25%"
      visible={visible}
    />
  );
};
