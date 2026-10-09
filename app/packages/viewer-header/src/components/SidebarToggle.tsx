/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { PanelRightCloseIcon, PanelRightOpenIcon } from "@voxel51/voodo";
import { useViewerSidebar } from "../hooks";
import HeaderAction from "./HeaderAction";

/** Shows or hides the sidebar the mode switch drives. */
const SidebarToggle = () => {
  const { available, toggle, visible } = useViewerSidebar();
  if (!available) return null;

  const label = `${visible ? "Hide" : "Show"} sidebar`;

  return (
    <HeaderAction
      data-cy="action-toggle-sidebar"
      icon={visible ? PanelRightCloseIcon : PanelRightOpenIcon}
      label={label}
      tooltip={`${label} (s)`}
      onClick={toggle}
    />
  );
};

export default SidebarToggle;
