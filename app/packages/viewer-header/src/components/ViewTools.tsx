/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ColorScheme, Options } from "@fiftyone/actions";
import { Link2Icon } from "@voxel51/voodo";
import type { ReactNode } from "react";
import { useCopySampleLink } from "../hooks";
import styles from "../ViewerHeader.module.css";
import Fullscreen from "./Fullscreen";
import { HeaderIconAction as HeaderAction } from "@fiftyone/app-header";

/** How the sample shows, and sharing it. */
const ViewTools = ({ utilities }: { utilities?: ReactNode }) => {
  const copyLink = useCopySampleLink();

  return (
    <div className={styles.cluster} data-cy="viewer-header-view-tools">
      <ColorScheme modal />
      <Options modal />
      <Fullscreen />
      {utilities}
      <HeaderAction
        data-cy="action-copy-sample-link"
        icon={Link2Icon}
        label="Copy link to sample"
        onClick={copyLink}
      />
    </div>
  );
};

export default ViewTools;
