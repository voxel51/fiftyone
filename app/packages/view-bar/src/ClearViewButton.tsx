/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  Anchor,
  Button,
  IconName,
  Size,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import styles from "./ClearViewButton.module.css";

/**
 * Applies the root view. Rendered whenever at least one stage is present,
 * in the same spot whether or not the stages row is open.
 */
export const ClearViewButton: React.FC<{ onClear: () => void }> = ({
  onClear,
}) => (
  <Tooltip anchor={Anchor.Bottom} content="Clear view">
    <Button
      onClick={onClear}
      aria-label="Clear view"
      data-cy="view-bar-clear-view"
      variant={Variant.Icon}
      size={Size.Sm}
      borderless
      leadingIcon={IconName.Close}
      className={styles.clear}
    />
  </Tooltip>
);
