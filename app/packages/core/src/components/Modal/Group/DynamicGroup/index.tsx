import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./nested";
import { UnorderedDynamicGroup } from "./simple/UnorderedDynamicGroup";
import { OrderedDynamicGroup } from "./simple/ordered/OrderedDynamicGroup";

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
      {hasGroupSlices ? (
        <NestedGroup />
      ) : orderBy ? (
        <OrderedDynamicGroup />
      ) : (
        <UnorderedDynamicGroup />
      )}
    </>
  );
};
