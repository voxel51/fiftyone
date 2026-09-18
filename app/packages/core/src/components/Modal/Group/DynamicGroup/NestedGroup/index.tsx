import * as fos from "@fiftyone/state";
import { Suspense } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "../pagination";

export const NestedGroup = () => {
  const shouldRenderImaVid = useReverbValue(fos.shouldRenderImaVidLooker(true));

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
