/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useOutsideClick } from "@fiftyone/state";
import { LayoutPanelTopIcon } from "@voxel51/voodo";
import { useRef, useState } from "react";
import styles from "../ViewerHeader.module.css";
import HeaderAction from "./HeaderAction";
import GroupVisibilityPopout, {
  GROUP_VISIBILITY_TITLE,
} from "./GroupVisibilityPopout";

/** Shows or hides a group's 3D viewer, 2D viewer and carousel. */
const GroupVisibility = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <div
      className={styles.anchor}
      ref={ref}
      data-cy="action-toggle-group-media-visibility"
    >
      <HeaderAction
        active={open}
        icon={LayoutPanelTopIcon}
        label={GROUP_VISIBILITY_TITLE}
        onClick={() => setOpen((current) => !current)}
      />
      {open && <GroupVisibilityPopout modal />}
    </div>
  );
};

export default GroupVisibility;
