import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Suspense } from "react";
import { PreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "../pagination";

export const NestedGroup = ({
  queryRef,
}: {
  queryRef: PreloadedQuery<foq.paginateSamplesQuery>;
}) => {
  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker);

  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      {!shouldRenderImaVid && (
        <Suspense>
          <GroupElementsLinkBar queryRef={queryRef} />
        </Suspense>
      )}
    </>
  );
};
