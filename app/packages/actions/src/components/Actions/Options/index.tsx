import ActionButton from "../ActionButton";
import { useOutsideClick } from "@fiftyone/state";
import { SettingsIcon } from "@voxel51/voodo";
import { useRef, useState } from "react";
import type { ActionProps } from "../types";
import { useActionIconSize } from "../iconSize";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import Options from "./Options";

export default ({
  modal,
  adaptiveMenuItemProps,
}: ActionProps & { modal?: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));
  const iconSize = useActionIconSize(24);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <ActionButton
        tooltipPlacement={modal ? "bottom" : "top"}
        icon={<SettingsIcon size={iconSize} />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={open}
        title={"Display options"}
        data-cy="action-display-options"
      />
      {open && <Options modal={modal} anchorRef={ref} />}
    </ActionDiv>
  );
};
