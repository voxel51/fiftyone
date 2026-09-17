import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import {
  useReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import { DynamicGroup } from "./DynamicGroup";
import GroupSample3d from "./GroupSample3d";
import { GroupView } from "./GroupView";

const Group = () => {
  const dynamic = useReverbValue(fos.isDynamicGroup);
  const only3d = useReverbValue(fos.only3d);
  const is3dVisible = fos.useIs3dVisible();
  const isLooker3DVisible = fos.useIs3dVisibleSetting();
  const isPinned = fos.useIs3dPinned();
  const actions = fos.useRenderConfig3dActions();
  const isMainVisible = useReverbValue(fos.groupMediaIsMain2DViewerVisible);

  const isNestedDynamicGroup = useReverbValue(fos.isNestedDynamicGroup);
  const isOrderedDynamicGroup = useReverbValue(fos.isOrderedDynamicGroup);
  const isCarouselVisible = useReverbValue(
    fos.groupMediaIsCarouselVisibleSetting,
  );
  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;

  const [dynamicGroupsViewMode, setDynamicGroupsViewMode] = useReverbState(
    fos.dynamicGroupsViewMode(true),
  );
  const setIsMainLookerVisible = useSetReverbState(
    fos.groupMediaIsMain2DViewerVisibleSetting,
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
    setDynamicGroupsViewMode,
    setIsMainLookerVisible,
  ]);

  useEffect(() => {
    if (is3dVisible && !isMainVisible && !isPinned) {
      void actions.setPinned(true);
    }
  }, [actions, is3dVisible, isMainVisible, isPinned]);

  if (dynamic) {
    return <DynamicGroup />;
  }

  if (only3d) {
    return <GroupSample3d />;
  }

  return <GroupView />;
};

export default Group;
