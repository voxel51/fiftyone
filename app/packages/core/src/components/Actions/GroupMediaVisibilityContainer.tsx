import { PillButton, PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import React, { useRef, useState } from "react";
import useMeasure from "react-use-measure";

import {
  groupMediaIs3DVisible,
  groupMediaIsCarouselVisible,
  groupMediaIsImageVisible,
  useOutsideClick,
} from "@fiftyone/state";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import Checkbox from "../Common/Checkbox";
import style from "../Modal/Modal.module.css";
import Popout from "./Popout";

interface GroupMediaVisibilityProps {
  modal: boolean;
}

const TITLE = "Toggle Media";

const Container = styled.div`
  position: relative;
`;

const GroupMediaVisibilityPopout = ({ modal }: { modal: boolean }) => {
  const [is3DVisible, setIs3DVisible] = useRecoilState(groupMediaIs3DVisible);
  const pointCloudSliceExists = useRecoilValue(fos.pointCloudSliceExists);
  const [isCarouselVisible, setIsCarouselVisible] = useRecoilState(
    groupMediaIsCarouselVisible
  );
  const [isImageVisible, setIsImageVisible] = useRecoilState(
    groupMediaIsImageVisible
  );

  return (
    <Popout modal={modal}>
      <PopoutSectionTitle>{TITLE}</PopoutSectionTitle>
      {pointCloudSliceExists && (
        <Checkbox
          name={"3D Viewer"}
          value={is3DVisible}
          muted={!isImageVisible && !isCarouselVisible}
          setValue={(value) => setIs3DVisible(value)}
        />
      )}

      <Checkbox
        name={"Carousel"}
        value={isCarouselVisible}
        muted={!(is3DVisible && pointCloudSliceExists) && !isImageVisible}
        setValue={(value) => setIsCarouselVisible(value)}
      />
      <Checkbox
        name={"Image"}
        value={isImageVisible}
        muted={!(is3DVisible && pointCloudSliceExists) && !isCarouselVisible}
        setValue={(value) => setIsImageVisible(value)}
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
      {open && <GroupMediaVisibilityPopout modal={modal} />}
    </Container>
  );
};
