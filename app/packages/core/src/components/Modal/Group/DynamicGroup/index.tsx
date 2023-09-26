import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { NestedGroup } from "./NestedGroup";
import { NonNestedDynamicGroup } from "./NonNestedGroup";

export const DynamicGroup = () => {
  const hasGroupSlices = useRecoilValue(fos.hasGroupSlices);

  return <>{hasGroupSlices ? <NestedGroup /> : <NonNestedDynamicGroup />}</>;
};
