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

export interface SegmentationToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const SegmentationToolbar = ({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: SegmentationToolbarProps) => {
  const { groups, visible } = useSegmentationActions({
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  });

  return (
    <ActionToolbar
      groups={groups}
      orientation={Orientation.Column}
      xOffset="5%"
      yOffset="25%"
      visible={visible}
    />
  );
};
