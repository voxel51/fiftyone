import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import React, { Suspense } from "react";
import { PreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "../pagination";

export const NestedGroup = ({
  queryRef,
}: {
  queryRef?: PreloadedQuery<foq.paginateSamplesQuery> | null;
}) => {
  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker);

  if (!queryRef && !shouldRenderImaVid) {
    throw new Error("no queryRef provided");
  }

  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      {!shouldRenderImaVid && queryRef && (
        <Suspense>
          <GroupElementsLinkBar queryRef={queryRef} />
        </Suspense>
      )}
    </>
  );
};
