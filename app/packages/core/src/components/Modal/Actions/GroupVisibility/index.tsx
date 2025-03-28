import { PillButton } from "@fiftyone/components";
import { useOutsideClick } from "@fiftyone/state";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import React from "react";
import styled from "styled-components";
import style from "../../Group/Group.module.css";
import GroupVisibilityAction, { TITLE } from "./GroupVisibility";

const Container = styled.div`
  position: relative;
`;

export default () => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <Container ref={ref} data-cy="action-toggle-group-media-visibility">
      <PillButton
        tooltipPlacement={"top"}
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
      {open && <GroupVisibilityAction anchorRef={ref} modal={true} />}
    </Container>
  );
};
