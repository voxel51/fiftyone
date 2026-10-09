import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { gridAt, gridFraction, gridPage } from "./atoms";

export default function useRefreshers() {
  const cropToContent = useReverbValue(fos.cropToContent(false));
  const datasetName = useReverbValue(fos.datasetName);
  const extendedStagesUnsorted = fos.stringifyObj(
    useReverbValue(fos.extendedStagesUnsorted),
  );
  const fieldVisibilityStage = fos.stringifyObj(
    useReverbValue(fos.fieldVisibilityStage) || {},
  );
  const filters = fos.stringifyObj(useReverbValue(fos.filters));
  const groupSlice = useReverbValue(fos.groupSlice);
  const mediaField = useReverbValue(fos.selectedMediaField(false));
  const queryPerformanceSetting = useReverbValue(fos.queryPerformanceSetting);
  const refresher = useReverbValue(fos.refresher);
  const shouldRenderImaVidLooker = useReverbValue(
    fos.shouldRenderImaVidLooker(false),
  );
  const similarityParameters = fos.stringifyObj(
    useReverbValue(fos.similarityParameters) || {},
  );
  const sort = useReverbValue(fos.gridSortBy);
  const view = fos.filterView(useReverbValue(fos.view) ?? []);
  const dsid = useReverbValue(fos.datasetId) ?? "";
  const scrubCursor = useReverbValue(fos.gridScrubCursor(dsid));

  // keys are the inputs themselves, so a remount in the same panel (after a
  // sample's page) finds the grid it left

  // only reload, attempt to return to the last grid location
  const layoutReset = JSON.stringify([
    cropToContent,
    fieldVisibilityStage,
    mediaField,
    queryPerformanceSetting,
  ]);

  // new data: the grid starts over, and the items it holds are stale
  const itemsReset = JSON.stringify([
    datasetName,
    extendedStagesUnsorted,
    filters,
    groupSlice,
    // A committed scrub cursor seeks pagination to a sort-field value;
    // remount Spotlight at the new AT location.
    scrubCursor ?? null,
    shouldRenderImaVidLooker,
    similarityParameters,
    view,
  ]);

  // the values reset the page, i.e. return to the top; a new sort reorders
  // the same items
  const pageReset = JSON.stringify([itemsReset, sort ?? null]);

  // the item cache outlives a new sort, so its items can move to their places
  const gridReset = JSON.stringify([layoutReset, itemsReset]);

  const reset = JSON.stringify([gridReset, refresher]);

  useEffect(() => {
    const unsubscribe = subscribe(({ event }, { reset }) => {
      // a layout change (a panel opening or closing) is not new data
      if (event === "fieldVisibility" || event === "spaces") return;

      // if not a modal page change, reset the grid location
      reset(gridAt);
      reset(gridPage);
      reset(gridFraction);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    dataReset: refresher,
    gridReset,
    itemsReset,
    pageReset,
    reset,
  };
}
