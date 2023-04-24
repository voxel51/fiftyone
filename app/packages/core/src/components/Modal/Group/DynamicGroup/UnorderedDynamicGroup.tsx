import React from "react";
import Sample from "../../Sample";
import { DynamicGroupCarousel } from "./carousel/DynamicGroupCarousel";
import { useDynamicGroupContext } from "./DynamicGroupContextProvider";

export const UnorderedDynamicGroup = () => {
  const { lookerRefCallback, groupByFieldValue } = useDynamicGroupContext();

  if (!groupByFieldValue) {
    return null;
  }

  return (
    <>
      <DynamicGroupCarousel key={groupByFieldValue} />
      <Sample lookerRefCallback={lookerRefCallback} />
    </>
  );
};
