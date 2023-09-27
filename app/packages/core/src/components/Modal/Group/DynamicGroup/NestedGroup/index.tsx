import * as foq from "@fiftyone/relay";
import React, { Suspense } from "react";
import { PreloadedQuery } from "react-relay";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "../pagination";

export const NestedGroup = ({
  queryRef,
}: {
  queryRef: PreloadedQuery<foq.paginateSamplesQuery, {}>;
}) => {
  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      <Suspense>
        <GroupElementsLinkBar queryRef={queryRef} />
      </Suspense>
    </>
  );
};
