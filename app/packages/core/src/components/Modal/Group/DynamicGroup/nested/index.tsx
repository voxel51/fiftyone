import React from "react";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "./GroupElementsLinkBar";
import { useGroupContext } from "../../GroupContextProvider";

export const NestedGroup = () => {
  const { groupByFieldValue } = useGroupContext();

  return (
    <GroupSuspense>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      <GroupElementsLinkBar key={groupByFieldValue} />
    </GroupSuspense>
  );
};
