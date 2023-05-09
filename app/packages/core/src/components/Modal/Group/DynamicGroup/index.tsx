import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { UnorderedDynamicGroup } from "./UnorderedDynamicGroup";

export const DynamicGroup = () => {
  /**
   * check if ordered or unordered
   */
  const dynamicGroupParameters = useRecoilValue(fos.dynamicGroupParameters);
  const hasGroupSlices = useRecoilValue(fos.groupSlices)?.length > 0;

  if (!dynamicGroupParameters) return null;

  const { orderBy } = dynamicGroupParameters;

  return (
    <>
      {/* todo: different component for ordered dynamic group */}
      {hasGroupSlices ? <NestedGroup /> : <UnorderedDynamicGroup />}
    </>
  );
};
