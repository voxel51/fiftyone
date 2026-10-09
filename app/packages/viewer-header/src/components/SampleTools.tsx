/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  ActionIconSizeContext,
  Selected,
  Similarity,
  Tag,
} from "@fiftyone/actions";
import {
  OperatorPlacements,
  types,
  useOperatorBrowser,
} from "@fiftyone/operators";
import { PackageIcon } from "@voxel51/voodo";
import { useViewerContext } from "../hooks";
import type { ViewerHeaderProps } from "../types";
import styles from "../ViewerHeader.module.css";
import GroupVisibility from "./GroupVisibility";
import HeaderAction from "./HeaderAction";
import HiddenLabels from "./HiddenLabels";

// the shared actions draw their icons at the header's icon size
const ICON_SIZE = 14;

const BrowseOperations = () => {
  const browser = useOperatorBrowser();

  return (
    <HeaderAction
      active={browser.isVisible}
      data-cy="action-browse-operations"
      icon={PackageIcon}
      label="Browse operations"
      onClick={() => browser.toggle()}
    />
  );
};

/** What acts on the sample: its labels, selection, tags, plugins. */
const SampleTools = ({ lookerRef }: Pick<ViewerHeaderProps, "lookerRef">) => {
  const { exploring, group, multimodal } = useViewerContext();

  return (
    <div className={styles.cluster} data-cy="viewer-header-sample-tools">
      <ActionIconSizeContext.Provider value={ICON_SIZE}>
        <HiddenLabels />
        {group && exploring && <GroupVisibility />}
        {exploring && <Selected modal lookerRef={lookerRef} />}
        {exploring && <Tag modal lookerRef={lookerRef} />}
        {exploring && !multimodal && <Similarity modal />}
        <OperatorPlacements modal place={types.Places.SAMPLES_VIEWER_ACTIONS} />
      </ActionIconSizeContext.Provider>
      <BrowseOperations />
    </div>
  );
};

export default SampleTools;
