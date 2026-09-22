import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import {
  useReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";

export const DynamicGroup = () => {
  const hasGroupSlices = useReverbValue(fos.hasGroupSlices);

  const shouldRenderImaVid = useReverbValue(fos.shouldRenderImaVidLooker(true));
  const [dynamicGroupsViewMode, setDynamicGroupsViewMode] = useReverbState(
    fos.dynamicGroupsViewMode(true),
  );
  const isOrderedDynamicGroup = useReverbValue(fos.isOrderedDynamicGroup);

  const setDynamicGroupCurrentElementIndex = useSetReverbState(
    fos.dynamicGroupCurrentElementIndex,
  );
  const imaVidIndex = useReverbValue(
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
    if (dynamicGroupsViewMode === "video" && !isOrderedDynamicGroup) {
      setDynamicGroupsViewMode("pagination");
    }
  }, [dynamicGroupsViewMode, isOrderedDynamicGroup, setDynamicGroupsViewMode]);

  return hasGroupSlices ? <NestedGroup /> : <NonNestedDynamicGroup />;
};
