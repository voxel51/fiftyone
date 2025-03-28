import { PillButton } from "@fiftyone/components";
import { sidebarVisible } from "@fiftyone/state";
import { KeyboardArrowLeft, KeyboardArrowRight } from "@mui/icons-material";
import React from "react";
import { useRecoilState } from "recoil";
import type { ActionProps } from "../types";
import { getStringAndNumberProps } from "../utils";

const ToggleSidebar = React.forwardRef<
  HTMLButtonElement,
  ActionProps & {
    modal: boolean;
  }
>(({ modal, adaptiveMenuItemProps }, ref) => {
  const [visible, setVisible] = useRecoilState(sidebarVisible(modal));

  return (
    <PillButton
      onClick={() => {
        setVisible(!visible);
      }}
      title={`${visible ? "Hide" : "Show"} sidebar`}
      tooltipPlacement={modal ? "bottom" : "top"}
      open={visible}
      icon={
        visible ? (
          modal ? (
            <KeyboardArrowRight />
          ) : (
            <KeyboardArrowLeft />
          )
        ) : modal ? (
          <KeyboardArrowLeft />
        ) : (
          <KeyboardArrowRight />
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
