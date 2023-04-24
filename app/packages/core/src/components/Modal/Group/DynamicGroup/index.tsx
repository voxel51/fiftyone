import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { DynamicGroupContextProvider } from "./DynamicGroupContextProvider";
import { UnorderedDynamicGroup } from "./UnorderedDynamicGroup";
import { NestedGroup } from "./NestedGroup";

interface DynamicGroupProps {
  lookerRefCallback: (looker: AbstractLooker) => void;
}

export const DynamicGroup = ({ lookerRefCallback }: DynamicGroupProps) => {
  /**
   * check if ordered or unordered
   */
  const dynamicGroupParameters = useRecoilValue(fos.dynamicGroupParameters);
  const hasGroupSlices = useRecoilValue(fos.groupSlices)?.length > 0;

  if (!dynamicGroupParameters) return null;

  const { orderBy } = dynamicGroupParameters;

  return (
    <DynamicGroupContextProvider
      lookerRefCallback={lookerRefCallback}
      dynamicGroupParameters={dynamicGroupParameters}
    >
      {/* todo: different component for ordered dynamic group */}
      {hasGroupSlices ? <NestedGroup /> : <UnorderedDynamicGroup />}
    </DynamicGroupContextProvider>
  );
};
