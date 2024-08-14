import * as fos from "@fiftyone/state";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "../pagination";

export const NestedGroup = () => {
  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));

  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      {!shouldRenderImaVid && (
        <Suspense>
          <GroupElementsLinkBar />
        </Suspense>
      )}
    </>
  );
};
