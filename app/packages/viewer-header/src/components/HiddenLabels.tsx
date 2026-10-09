/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { EyeOffIcon, Size, TextAction, Tooltip } from "@voxel51/voodo";
import { useViewerHiddenLabels } from "../hooks";
import styles from "../ViewerHeader.module.css";

/** How many labels are hidden; clicking shows them again. */
const HiddenLabels = () => {
  const { clear, count } = useViewerHiddenLabels();
  if (count < 1) return null;

  return (
    <Tooltip anchor="bottom" content="Clear hidden labels" portal>
      <TextAction
        aria-label="Clear hidden labels"
        className={styles.action}
        data-cy="action-clear-hidden-labels"
        leadingIcon={EyeOffIcon}
        size={Size.Sm}
        onClick={clear}
      >
        {count.toLocaleString()}
      </TextAction>
    </Tooltip>
  );
};

export default HiddenLabels;
