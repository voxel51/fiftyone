import ActionButton from "../ActionButton";
import { sidebarVisible } from "@fiftyone/state";
import { KeyboardArrowLeftIcon, KeyboardArrowRightIcon } from "@voxel51/voodo";
import React from "react";
import { useReverbState } from "@fiftyone/reverb";
import type { ActionProps } from "../types";
import { useActionIconSize } from "../iconSize";
import { getStringAndNumberProps } from "../utils";

const ToggleSidebar = React.forwardRef<
  HTMLButtonElement,
  ActionProps & {
    modal: boolean;
  }
>(({ modal, adaptiveMenuItemProps }, ref) => {
  const [visible, setVisible] = useReverbState(sidebarVisible(modal));
  const iconSize = useActionIconSize(24);

  return (
    <ActionButton
      onClick={() => {
        setVisible(!visible);
      }}
      title={`${visible ? "Hide" : "Show"} sidebar (s)`}
      tooltipPlacement={modal ? "bottom" : "top"}
      open={visible}
      icon={
        visible ? (
          modal ? (
            <KeyboardArrowRightIcon size={iconSize} />
          ) : (
            <KeyboardArrowLeftIcon size={iconSize} />
          )
        ) : modal ? (
          <KeyboardArrowLeftIcon size={iconSize} />
        ) : (
          <KeyboardArrowRightIcon size={iconSize} />
        )
      }
      highlight={!visible}
      ref={ref}
      data-cy="action-toggle-sidebar"
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
    />
  );
});

export default ToggleSidebar;
