import React from "react";
import Sample from "../../Sample";
import { useGroupContext } from "../GroupContextProvider";
import { DynamicGroupCarousel } from "./carousel/DynamicGroupCarousel";

export const UnorderedDynamicGroup = () => {
  const { lookerRefCallback, groupByFieldValue } = useGroupContext();

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
