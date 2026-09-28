import * as fos from "@fiftyone/state";
import { VideoAnnotationSurface } from "@fiftyone/video-annotation";
import { useEffect } from "react";
import {
  useReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import { Loading } from "@fiftyone/components";
import { DynamicGroup } from "./DynamicGroup";
import GroupSample3d from "./GroupSample3d";
import { GroupView } from "./GroupView";

const AnnotateDynamicGroupVideo = () => {
  const modalSample = fos.useModalSample();

  if (!modalSample) {
    return <Loading>Pixelating...</Loading>;
  }

  return <VideoAnnotationSurface sample={modalSample} />;
};

const Group = () => {
  const dynamic = useReverbValue(fos.isDynamicGroup);
  const only3d = useReverbValue(fos.only3d);
  const isLooker3DVisible = fos.useIs3dVisibleSetting();

  const isNestedDynamicGroup = useReverbValue(fos.isNestedDynamicGroup);
  const isOrderedDynamicGroup = useReverbValue(fos.isOrderedDynamicGroup);
  const isCarouselVisible = useReverbValue(
    fos.groupMediaIsCarouselVisibleSetting,
  );
  const isAnnotateMode = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  const isImageDynamicGroupVideo = fos.useIsImageDynamicGroupVideo();

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

  // the video surface replaces the entire group view; the modal sample read
  // lives in the child so a sparse group's missing slice never evaluates here
  if (isAnnotateMode && isImageDynamicGroupVideo) {
    return <AnnotateDynamicGroupVideo />;
  }

  if (dynamic) {
    return <DynamicGroup />;
  }

  if (only3d) {
    return <GroupSample3d />;
  }

  return <GroupView />;
};

export default Group;
