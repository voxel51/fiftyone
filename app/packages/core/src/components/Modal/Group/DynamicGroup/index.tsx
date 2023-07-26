import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { UnorderedDynamicGroup } from "./UnorderedDynamicGroup";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  return (
    <>
      {/* todo: different component for ordered dynamic group */}
      {hasGroupSlices ? <NestedGroup /> : <UnorderedDynamicGroup />}
    </>
  );
};
