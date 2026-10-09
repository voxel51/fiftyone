import { ActionDiv } from "@fiftyone/actions";
import { PillButton } from "@fiftyone/components";
import { ModalMode, useModalMode, useOutsideClick } from "@fiftyone/state";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import React from "react";
import style from "../../Group/Group.module.css";
import {
  GroupVisibilityPopout as GroupVisibilityAction,
  GROUP_VISIBILITY_TITLE as TITLE,
} from "@fiftyone/viewer-header";

export default () => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  if (useModalMode() === ModalMode.ANNOTATE) return null;

  return (
    <ActionDiv ref={ref} data-cy="action-toggle-group-media-visibility">
      <PillButton
        tooltipPlacement={"bottom"}
        icon={
          <ViewComfyIcon classes={{ root: style.groupMediaVisibilityIcon }} />
        }
        open={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        title={TITLE}
        highlight={open}
      />
      {open && <GroupVisibilityAction modal={true} />}
    </ActionDiv>
  );
};
