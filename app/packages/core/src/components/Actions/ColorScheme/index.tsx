import { useTrackEvent } from "@fiftyone/analytics";
import { PillButton } from "@fiftyone/components";
import { ColorLens } from "@mui/icons-material";
import React, { useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { activeColorEntry } from "../../ColorModal/state";
import { ACTIVE_FIELD } from "../../ColorModal/utils";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";

export default ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const trackEvent = useTrackEvent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [activeField, setActiveField] = useRecoilState(activeColorEntry);

  const onOpen = () => {
    trackEvent("open_color_settings");
    setOpen(!open);
    setActiveField(ACTIVE_FIELD.GLOBAL);
    adaptiveMenuItemProps?.closeOverflow?.();
  };

  const change = Boolean(activeField);
  useEffect(() => {
    setOpen(change);
  }, [change]);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        data-cy="action-color-settings"
        highlight={open}
        icon={<ColorLens />}
        onClick={onOpen}
        open={open}
        title={"Color settings"}
        tooltipPlacement={modal ? "bottom" : "top"}
      />
    </ActionDiv>
  );
};
