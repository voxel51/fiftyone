import { PopoutSectionTitle } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import type { MutableRefObject, ReactNode } from "react";
import React, { useMemo } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import Popout from "../../../Actions/Popout";
import Checkbox from "../../../Common/Checkbox";

export const TITLE = "Toggle renderer configuration";

export default ({
  modal,
  anchorRef,
}: {
  modal: boolean;
  anchorRef: MutableRefObject<HTMLDivElement | null>;
}) => {
  const threeDSliceExists = fos.useHas3dSlice();
  const isSlotVisible = fos.useIs3dVisibleSetting();
  const actions = fos.useRenderConfig3dActions();
  const [isCarouselVisible, setIsCarouselVisible] = useRecoilState(
    fos.groupMediaIsCarouselVisibleSetting,
  );
  const [isMainVisible, setIsMainVisible] = useRecoilState(
    fos.groupMediaIsMain2DViewerVisibleSetting,
  );
  const isNestedDynamicGroup = useRecoilValue(fos.isNestedDynamicGroup);
  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
  const dynamicGroupsViewMode = useRecoilValue(fos.dynamicGroupsViewMode(true));
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);
  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;

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
          setValue={(value) => actions.setVisible(value)}
        />,
      );
    }

    // Mute the 2D Viewer checkbox when annotate mode controls visibility for a 3D slice
    const isAnnotating3d = isAnnotateMode && isSlotVisible && threeDSliceExists;

    toReturn.push(
      <Checkbox
        key="checkbox-viewer"
        name={"2D Viewer"}
        value={isMainVisible}
        muted={
          isAnnotating3d ||
          isImavidInNestedGroup ||
          (!isCarouselVisible && toReturn.length === 0) ||
          (!(isSlotVisible && threeDSliceExists) && !isCarouselVisible)
        }
        setValue={(value) => setIsMainVisible(value)}
      />,
    );

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
        />,
      );
    }

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
    isAnnotateMode,
    actions,
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
