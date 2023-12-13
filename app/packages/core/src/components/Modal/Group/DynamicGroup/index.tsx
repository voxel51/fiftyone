import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";
import { useDynamicGroupSamples } from "./useDynamicGroupSamples";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const { queryRef } = useDynamicGroupSamples();

  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker);
  const setDynamicGroupCurrentElementIndex = useSetRecoilState(
    fos.dynamicGroupCurrentElementIndex
  );
  const imaVidIndex = useRecoilValue(
    fos.imaVidLookerState("currentFrameNumber")
  );

  useEffect(() => {
    // checking for integer because it is initialized to a float random value in useInitializeImaVidSubscriptions
    if (shouldRenderImaVid && Number.isInteger(imaVidIndex)) {
      setDynamicGroupCurrentElementIndex(imaVidIndex);
    }
  }, [shouldRenderImaVid, imaVidIndex, setDynamicGroupCurrentElementIndex]);

  return (
    <>
      {hasGroupSlices ? (
        <NestedGroup queryRef={queryRef} />
      ) : (
        <NonNestedDynamicGroup queryRef={queryRef} />
      )}
    </>
  );
};
