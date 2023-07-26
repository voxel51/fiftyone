import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { UnorderedDynamicGroup } from "./UnorderedDynamicGroup";

export const DynamicGroup = () => {
  /**
   * check if ordered or unordered
   */
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  if (!isDynamicGroup) return null;

  return (
    <>
      {/* todo: different component for ordered dynamic group */}
      {hasGroupSlices ? <NestedGroup /> : <UnorderedDynamicGroup />}
    </>
  );
};
