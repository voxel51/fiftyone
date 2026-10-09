import { ACTIVE_FIELD, activeColorEntry } from "@fiftyone/state";
import { useTrackEvent } from "@fiftyone/analytics";
import ActionButton from "../ActionButton";
import { ColorLensIcon } from "@voxel51/voodo";
import { useEffect, useRef, useState } from "react";
import { useReverbState } from "@fiftyone/reverb";

import type { ActionProps } from "../types";
import { useActionIconSize } from "../iconSize";
import { ActionDiv, getStringAndNumberProps } from "../utils";

export default ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const trackEvent = useTrackEvent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [activeField, setActiveField] = useReverbState(activeColorEntry);
  const iconSize = useActionIconSize(24);

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
      <ActionButton
        data-cy="action-color-settings"
        highlight={open}
        icon={<ColorLensIcon size={iconSize} />}
        onClick={onOpen}
        open={open}
        title={"Color settings"}
        tooltipPlacement={modal ? "bottom" : "top"}
      />
    </ActionDiv>
  );
};
