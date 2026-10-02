import * as fos from "@fiftyone/state";
import { Suspense } from "react";
import { GroupElementsLinkBar } from "../Group/DynamicGroup/pagination";
import { footer } from "./SampleTilingHost.module.css";

/**
 * Whether the host shows the dynamic-group paginator under the mosaic:
 * the same conditions the group tree used when it rendered the bar itself.
 */
export function useShowsDynamicGroupPaginator(): boolean {
  const dynamic = fos.useIsDynamicGroup();
  const nested = fos.useHasGroupSlices();
  const imaVid = fos.useShouldRenderImaVidLooker(true);
  const viewMode = fos.useDynamicGroupsViewMode(true);
  if (!dynamic) return false;
  return nested ? !imaVid : viewMode === "pagination";
}

/** The dynamic-group element paginator, in the host footer. */
export const DynamicGroupPaginator = () => (
  <div className={footer} data-cy="group-elements-paginator">
    <Suspense fallback={null}>
      <GroupElementsLinkBar />
    </Suspense>
  </div>
);
