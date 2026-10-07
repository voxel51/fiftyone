import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";
import { useGroupTimelineAvailable } from "../../Tiles/playback/use-group-playback";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
  const [dynamicGroupsViewMode, setDynamicGroupsViewMode] = useRecoilState(
    fos.dynamicGroupsViewMode(true),
  );
  const isOrderedDynamicGroup = useRecoilValue(fos.isOrderedDynamicGroup);
  const timelineAvailable = useGroupTimelineAvailable();

  const setDynamicGroupCurrentElementIndex = useSetRecoilState(
    fos.dynamicGroupCurrentElementIndex,
  );
  const imaVidIndex = useRecoilValue(
    fos.imaVidLookerState("currentFrameNumber"),
  );

  useEffect(() => {
    // checking for integer because it is initialized to a float random value
    // in useInitializeImaVidSubscriptions
    if (shouldRenderImaVid && Number.isInteger(imaVidIndex)) {
      setDynamicGroupCurrentElementIndex(imaVidIndex);
    }
  }, [shouldRenderImaVid, imaVidIndex, setDynamicGroupCurrentElementIndex]);

  useEffect(() => {
    // if dynamic group view mode is video but dynamic group is not ordered,
    // we want to set view mode back to pagination (default)
    if (
      (dynamicGroupsViewMode === "video" ||
        dynamicGroupsViewMode === "timeline") &&
      !isOrderedDynamicGroup
    ) {
      setDynamicGroupsViewMode("pagination");
    }
  }, [dynamicGroupsViewMode, isOrderedDynamicGroup, setDynamicGroupsViewMode]);

  useEffect(() => {
    // a stored "timeline" choice outlives the feature flag and the view it
    // was made for; page instead when the timeline is not offered here
    if (dynamicGroupsViewMode === "timeline" && !timelineAvailable) {
      setDynamicGroupsViewMode("pagination");
    }
  }, [dynamicGroupsViewMode, setDynamicGroupsViewMode, timelineAvailable]);

  return hasGroupSlices ? <NestedGroup /> : <NonNestedDynamicGroup />;
};
