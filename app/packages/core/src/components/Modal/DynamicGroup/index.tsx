import { AbstractLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { DynamicGroupContextProvider } from "./DynamicGroupContextProvider";
import { UnorderedDynamicGroup } from "./UnorderedDynamicGroup";

interface DynamicGroupProps {
  lookerRefCallback: (looker: AbstractLooker) => void;
}

export const DynamicGroup = ({ lookerRefCallback }: DynamicGroupProps) => {
  /**
   * check if ordered or unordered
   */
  const dynamicGroupParameters = useRecoilValue(fos.dynamicGroupParameters);

  if (!dynamicGroupParameters) return null;

  const { orderBy } = dynamicGroupParameters;

  return (
    <DynamicGroupContextProvider
      lookerRefCallback={lookerRefCallback}
      dynamicGroupParameters={dynamicGroupParameters}
    >
      <UnorderedDynamicGroup />
      {/* {orderBy ? null : <UnorderedDynamicGroup />} */}
    </DynamicGroupContextProvider>
  );
};
