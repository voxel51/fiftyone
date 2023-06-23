import React from "react";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "./GroupElementsLinkBar";

export const NestedGroup = () => {
  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      <GroupElementsLinkBar />
    </>
  );
};
