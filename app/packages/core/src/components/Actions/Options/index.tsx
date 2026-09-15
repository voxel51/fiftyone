import { Anchor } from "@voxel51/voodo";
import { PillButton } from "@fiftyone/components";
import { useOutsideClick } from "@fiftyone/state";
import { Settings } from "@mui/icons-material";
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
      <PillButton
        tooltipPlacement={modal ? Anchor.Bottom : Anchor.Top}
        icon={<Settings />}
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
