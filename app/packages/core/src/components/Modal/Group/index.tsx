import * as fos from "@fiftyone/state";
import React from "react";

import { useRecoilValue } from "recoil";
import { DynamicGroup } from "./DynamicGroup";
import { GroupSuspense } from "./GroupSuspense";
import { GroupView } from "./GroupView";

const Group = () => {
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);

  if (isDynamicGroup) {
    return <DynamicGroup />;
  }

  return (
    <GroupSuspense>
      <GroupView />
    </GroupSuspense>
  );
};

export default Group;
