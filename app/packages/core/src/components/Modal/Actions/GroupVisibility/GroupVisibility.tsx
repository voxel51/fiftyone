import { PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import type { MutableRefObject, ReactNode } from "react";
import React, { useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import Popout from "../../../Actions/Popout";
import Checkbox from "../../../Common/Checkbox";

export const TITLE = "Toggle media";

export default ({
  modal,
  anchorRef,
}: {
  modal: boolean;
  anchorRef: MutableRefObject<HTMLDivElement | null>;
}) => {
  const [isSlotVisible, setIsSlotVisible] = useRecoilState(
    fos.groupMedia3dVisibleSetting
  );
  const threeDSliceExists = useRecoilValue(fos.has3dSlice);
  const [isCarouselVisible, setIsCarouselVisible] = useRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const [isMainVisible, setIsMainVisible] = useRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );
  const isNestedDynamicGroup = useRecoilValue(fos.isNestedDynamicGroup);
  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
  const dynamicGroupsViewMode = useRecoilValue(fos.dynamicGroupsViewMode(true));
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const isSequentialAccessAllowed =
    isNestedDynamicGroup ||
    dynamicGroupsViewMode === "carousel" ||
    hasGroupSlices;

  const isImavidInNestedGroup = isNestedDynamicGroup && shouldRenderImaVid;

  const checkboxes = useMemo(() => {
    const toReturn: ReactNode[] = [];

    if (threeDSliceExists) {
      toReturn.push(
        <Checkbox
          key="checkbox-3d-viewer"
          name={"3D Viewer"}
          value={isSlotVisible}
          muted={
            isImavidInNestedGroup || (!isMainVisible && !isCarouselVisible)
          }
          setValue={(value) => setIsSlotVisible(value)}
        />
      );
    }

    if (isSequentialAccessAllowed) {
      toReturn.push(
        <Checkbox
          key="checkbox-carousel"
          name={"Carousel"}
          value={isCarouselVisible}
          muted={
            isImavidInNestedGroup ||
            (!(isSlotVisible && threeDSliceExists) && !isMainVisible)
          }
          setValue={(value) => setIsCarouselVisible(value)}
        />
      );
    }

    toReturn.push(
      <Checkbox
        key="checkbox-viewer"
        name={"Viewer"}
        value={isMainVisible}
        muted={
          isImavidInNestedGroup ||
          toReturn.length === 0 ||
          (!(isSlotVisible && threeDSliceExists) && !isCarouselVisible)
        }
        setValue={(value) => setIsMainVisible(value)}
      />
    );

    return toReturn;
  }, [
    threeDSliceExists,
    isSequentialAccessAllowed,
    isCarouselVisible,
    isMainVisible,
    isSlotVisible,
    setIsMainVisible,
    isImavidInNestedGroup,
    setIsCarouselVisible,
    setIsSlotVisible,
  ]);

  return (
    <Popout
      fixed
      anchorRef={anchorRef}
      modal={modal}
      testId="group-media-visibility-popout"
    >
      <PopoutSectionTitle>{TITLE}</PopoutSectionTitle>
      {checkboxes}
    </Popout>
  );
};
