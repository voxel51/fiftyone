import { PillButton, PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useOutsideClick } from "@fiftyone/state";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import React, { RefObject } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import Checkbox from "../Common/Checkbox";
import style from "../Modal/Group/Group.module.css";
import Popout from "./Popout";

interface GroupMediaVisibilityProps {
  modal: boolean;
}

const TITLE = "Toggle media";

const Container = styled.div`
  position: relative;
`;

const GroupMediaVisibilityPopout = ({
  modal,
  anchorRef,
}: {
  modal: boolean;
  anchorRef: RefObject<HTMLDivElement>;
}) => {
  const [isSlotVisible, setIsSlotVisible] = useRecoilState(
    fos.groupMedia3dVisibleSetting
  );
  const pointCloudSliceExists = useRecoilValue(fos.groupMediaTypesSet).has(
    "point_cloud"
  );
  const [isCarouselVisible, setIsCarouselVisible] = useRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const [isMainVisible, setIsMainVisible] = useRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );

  return (
    <Popout
      fixed
      anchorRef={anchorRef}
      modal={modal}
      testId="group-media-visibility-popout"
    >
      <PopoutSectionTitle>{TITLE}</PopoutSectionTitle>
      {pointCloudSliceExists && (
        <Checkbox
          name={"3D Viewer"}
          value={isSlotVisible}
          muted={!isMainVisible && !isCarouselVisible}
          setValue={(value) => setIsSlotVisible(value)}
        />
      )}

      <Checkbox
        name={"Carousel"}
        value={isCarouselVisible}
        muted={!(isSlotVisible && pointCloudSliceExists) && !isMainVisible}
        setValue={(value) => setIsCarouselVisible(value)}
      />
      <Checkbox
        name={"Viewer"}
        value={isMainVisible}
        muted={!(isSlotVisible && pointCloudSliceExists) && !isCarouselVisible}
        setValue={(value) => setIsMainVisible(value)}
      />
    </Popout>
  );
};

export const GroupMediaVisibilityContainer = ({
  modal,
}: GroupMediaVisibilityProps) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <Container ref={ref} data-cy="action-toggle-group-media-visibility">
      <PillButton
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
      {open && <GroupMediaVisibilityPopout anchorRef={ref} modal={modal} />}
    </Container>
  );
};
