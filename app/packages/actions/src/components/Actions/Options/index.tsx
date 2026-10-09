import ActionButton from "../ActionButton";
import { useOutsideClick } from "@fiftyone/state";
import { Settings2Icon } from "@voxel51/voodo";
import { useRef, useState } from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import Options from "./Options";

export default ({
  modal,
  adaptiveMenuItemProps,
}: ActionProps & { modal?: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <ActionButton
        tooltipPlacement={modal ? "bottom" : "top"}
        icon={Settings2Icon}
        onClick={() => setOpen(!open)}
        highlight={open}
        title={"Display options"}
        data-cy="action-display-options"
      />
      {open && <Options modal={modal} anchorRef={ref} />}
    </ActionDiv>
  );
};
