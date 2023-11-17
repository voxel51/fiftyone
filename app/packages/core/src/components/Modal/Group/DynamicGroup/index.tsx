import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";
import { useDynamicGroupSamples } from "./useDynamicGroupSamples";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  const { queryRef } = useDynamicGroupSamples();

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
