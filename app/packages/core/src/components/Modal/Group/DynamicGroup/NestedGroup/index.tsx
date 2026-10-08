import * as fos from "@fiftyone/state";
import { Suspense } from "react";
import { useRecoilValue } from "recoil";
import { GroupSuspense } from "../../GroupSuspense";
import { GroupView } from "../../GroupView";
import { GroupElementsLinkBar } from "../pagination";
import { useHostsPaginator } from "../../../Tiles/host-context";

export const NestedGroup = () => {
  const shouldRenderImaVid = useRecoilValue(fos.shouldRenderImaVidLooker(true));
  const hostsPaginator = useHostsPaginator();

  return (
    <>
      <GroupSuspense>
        <GroupView />
      </GroupSuspense>
      {!shouldRenderImaVid && !hostsPaginator && (
        <Suspense>
          <GroupElementsLinkBar />
        </Suspense>
      )}
    </>
  );
};
