import * as fos from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
  const [dynamicGroupsViewMode, setDynamicGroupsViewMode] = useRecoilState(
    fos.dynamicGroupsViewMode(true)
  );
  const isOrderedDynamicGroup = useRecoilValue(fos.isOrderedDynamicGroup);

  const setDynamicGroupCurrentElementIndex = useSetRecoilState(
    fos.dynamicGroupCurrentElementIndex
  );
  const imaVidIndex = useRecoilValue(
    fos.imaVidLookerState("currentFrameNumber")
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
    if (dynamicGroupsViewMode === "video" && !isOrderedDynamicGroup) {
      setDynamicGroupsViewMode("pagination");
    }
  }, [dynamicGroupsViewMode, isOrderedDynamicGroup, setDynamicGroupsViewMode]);

  return hasGroupSlices ? <NestedGroup /> : <NonNestedDynamicGroup />;
};
