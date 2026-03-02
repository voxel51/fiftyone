import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { DynamicGroup } from "./DynamicGroup";
import GroupSample3d from "./GroupSample3d";
import { GroupView } from "./GroupView";

const Group = () => {
  const dynamic = useRecoilValue(fos.isDynamicGroup);
  const only3d = useRecoilValue(fos.only3d);

  const isNestedDynamicGroup = useRecoilValue(fos.isNestedDynamicGroup);
  const isOrderedDynamicGroup = useRecoilValue(fos.isOrderedDynamicGroup);
  const isLooker3DVisible = useRecoilValue(fos.groupMedia3dVisibleSetting);
  const isCarouselVisible = useRecoilValue(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;

  const [dynamicGroupsViewMode, setDynamicGroupsViewMode] = useRecoilState(
    fos.dynamicGroupsViewMode(true)
  );
  const setIsMainLookerVisible = useSetRecoilState(
    fos.groupMediaIsMain2DViewerVisibleSetting
  );

  // This effect enforces view-mode constraints for dynamic groups (skipped in annotate mode)
  useEffect(() => {
    if (
      isNestedDynamicGroup &&
      !isOrderedDynamicGroup &&
      dynamicGroupsViewMode !== "pagination"
    ) {
      setDynamicGroupsViewMode("pagination");
    }

    if (
      dynamicGroupsViewMode === "video" &&
      (isLooker3DVisible || isCarouselVisible) &&
      !isAnnotateMode
    ) {
      setIsMainLookerVisible(true);
    }
  }, [
    dynamicGroupsViewMode,
    isNestedDynamicGroup,
    isOrderedDynamicGroup,
    isLooker3DVisible,
    isCarouselVisible,
    isAnnotateMode,
  ]);

  if (dynamic) {
    return <DynamicGroup />;
  }

  if (only3d) {
    return <GroupSample3d />;
  }

  return <GroupView />;
};

export default Group;
