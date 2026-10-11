/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { MaximizeIcon, MinimizeIcon } from "@voxel51/voodo";
import { useViewerFullscreen } from "../hooks";
import { HeaderIconAction as HeaderAction } from "@fiftyone/app-header";

/** Enters or exits fullscreen, which hides the header; `f` does the same. */
const Fullscreen = () => {
  const { fullscreen, toggle } = useViewerFullscreen();
  const label = fullscreen ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <HeaderAction
      active={fullscreen}
      data-cy="action-toggle-fullscreen"
      icon={fullscreen ? MinimizeIcon : MaximizeIcon}
      label={label}
      tooltip={`${label} (f)`}
      onClick={toggle}
    />
  );
};

export default Fullscreen;
