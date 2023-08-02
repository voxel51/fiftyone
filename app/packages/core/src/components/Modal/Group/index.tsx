import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { DynamicGroup } from "./DynamicGroup";
import GroupSample3d from "./GroupSample3d";
import { GroupView } from "./GroupView";

const Group = () => {
  const dynamic = useRecoilValue(fos.isDynamicGroup);
  const onlyPcd = useRecoilValue(fos.onlyPcd);

  if (dynamic) {
    return <DynamicGroup />;
  }

  if (onlyPcd) {
    return <GroupSample3d />;
  }

  return <GroupView />;
};

export default Group;
