/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ActionIconSizeContext, ColorScheme, Options } from "@fiftyone/actions";
import {
  AddLinkIcon,
  FullscreenExitIcon,
  FullscreenIcon,
} from "@voxel51/voodo";
import type { ReactNode } from "react";
import { useCopySampleLink, useViewerFullscreen } from "../hooks";
import styles from "../ViewerHeader.module.css";
import HeaderAction from "./HeaderAction";

const Fullscreen = () => {
  const { fullscreen, toggle } = useViewerFullscreen();
  const label = fullscreen ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <HeaderAction
      active={fullscreen}
      data-cy="action-toggle-fullscreen"
      icon={fullscreen ? FullscreenExitIcon : FullscreenIcon}
      label={label}
      tooltip={`${label} (f)`}
      onClick={toggle}
    />
  );
};

/** How the sample shows, and sharing it. */
const ViewTools = ({ utilities }: { utilities?: ReactNode }) => {
  const copyLink = useCopySampleLink();

  return (
    <div className={styles.cluster} data-cy="viewer-header-view-tools">
      <ActionIconSizeContext.Provider value={14}>
        <ColorScheme modal />
        <Options modal />
      </ActionIconSizeContext.Provider>
      <Fullscreen />
      {utilities}
      <HeaderAction
        data-cy="action-copy-sample-link"
        icon={AddLinkIcon}
        label="Copy link to sample"
        onClick={copyLink}
      />
    </div>
  );
};

export default ViewTools;
