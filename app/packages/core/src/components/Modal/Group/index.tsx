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

  const [dynamicGroupsViewMode, setDynamicGroupsViewMode] = useRecoilState(
    fos.dynamicGroupsViewMode
  );
  const setIsMainLookerVisible = useSetRecoilState(
    fos.groupMediaIsMainVisibleSetting
  );

  useEffect(() => {
    // if it is unordered nested dynamic group and mode is not pagination, set to pagination
    if (
      isNestedDynamicGroup &&
      !isOrderedDynamicGroup &&
      dynamicGroupsViewMode !== "pagination"
    ) {
      setDynamicGroupsViewMode("pagination");
    }

    // hide 3d looker and carousel if `hasGroupSlices`
    if (
      dynamicGroupsViewMode === "video" &&
      (isLooker3DVisible || isCarouselVisible)
    ) {
      setIsMainLookerVisible(true);
    }
  }, [
    dynamicGroupsViewMode,
    isNestedDynamicGroup,
    isOrderedDynamicGroup,
    isLooker3DVisible,
    isCarouselVisible,
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
