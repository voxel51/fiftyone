/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Size, TextAction, Tooltip, VisibilityOffIcon } from "@voxel51/voodo";
import { useViewerHiddenLabels } from "../hooks";

/** How many labels are hidden; clicking shows them again. */
const HiddenLabels = () => {
  const { clear, count } = useViewerHiddenLabels();
  if (count < 1) return null;

  return (
    <Tooltip anchor="bottom" content="Clear hidden labels" portal>
      <TextAction
        aria-label="Clear hidden labels"
        data-cy="action-clear-hidden-labels"
        leadingIcon={VisibilityOffIcon}
        size={Size.Sm}
        onClick={clear}
      >
        {count.toLocaleString()}
      </TextAction>
    </Tooltip>
  );
};

export default HiddenLabels;
