import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { DynamicGroup } from "./DynamicGroup";
import { GroupView } from "./GroupView";

const Group = () =>
  useRecoilValue(fos.isDynamicGroup) ? <DynamicGroup /> : <GroupView />;

export default Group;
