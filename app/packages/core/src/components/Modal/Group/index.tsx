import * as fos from "@fiftyone/state";
import React from "react";

import { useRecoilValue } from "recoil";
import { DynamicGroup } from "./DynamicGroup";
import { GroupSuspense } from "./GroupSuspense";
import { GroupView } from "./GroupView";

const Group: React.FC<{ lookerRefCallback: (looker) => void }> = ({
  lookerRefCallback,
}) => {
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);

  if (isDynamicGroup) {
    return <DynamicGroup lookerRefCallback={lookerRefCallback} />;
  }

  return (
    <GroupSuspense>
      <GroupView lookerRefCallback={lookerRefCallback} />
    </GroupSuspense>
  );
};

export default Group;
