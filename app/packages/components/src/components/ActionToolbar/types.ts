/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Shared data types for the data-driven ActionToolbar renderer.
 * These live in @fiftyone/components so both @fiftyone/core (2D segmentation)
 * and @fiftyone/looker-3d (3D annotation) can depend on them without creating
 * a cross-package dependency between those two packages.
 */

import type { ReactNode } from "react";

export interface ToolbarActionItem {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip?: string | ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  isVisible?: boolean;
  onClick: () => void;
  /** Escape hatch: renders this node instead of the standard icon button. */
  customComponent?: ReactNode;
}

export interface ToolbarActionGroup {
  id: string;
  label?: string;
  isHidden?: boolean;
  actions: ToolbarActionItem[];
}
