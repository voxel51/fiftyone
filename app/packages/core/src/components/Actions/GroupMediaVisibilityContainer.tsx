import { PillButton, PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { useOutsideClick } from "@fiftyone/state";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import { MutableRefObject, useRef, useState } from "react";
import useMeasure from "react-use-measure";
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
  anchorRef: MutableRefObject<HTMLDivElement>;
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
    <Popout fixed anchorRef={anchorRef} modal={modal}>
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef] = useMeasure();

  return (
    <Container ref={ref}>
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
        ref={mRef}
      />
      {open && <GroupMediaVisibilityPopout anchorRef={ref} modal={modal} />}
    </Container>
  );
};
