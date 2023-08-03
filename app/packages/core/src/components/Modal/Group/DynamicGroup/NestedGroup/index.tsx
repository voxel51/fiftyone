import React, { Suspense } from "react";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "./GroupElementsLinkBar";

export const NestedGroup = () => {
  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      <Suspense>
        <GroupElementsLinkBar />
      </Suspense>
    </>
  );
};
