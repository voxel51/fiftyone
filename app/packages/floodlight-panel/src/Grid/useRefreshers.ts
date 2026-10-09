import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import uuid from "react-uuid";
import { useReverbValue } from "@fiftyone/reverb";
import { useMemoOne } from "use-memo-one";
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

  // only reload, attempt to return to the last grid location
  const layoutReset = useMemoOne(() => {
    cropToContent;
    fieldVisibilityStage;
    mediaField;
    queryPerformanceSetting;
    return uuid();
  }, [
    cropToContent,
    fieldVisibilityStage,
    mediaField,
    queryPerformanceSetting,
  ]);

  // new data: the grid starts over, and the items it holds are stale
  const itemsReset = useMemoOne(() => {
    datasetName;
    extendedStagesUnsorted;
    filters;
    groupSlice;
    shouldRenderImaVidLooker;
    similarityParameters;
    view;
    return uuid();
  }, [
    datasetName,
    extendedStagesUnsorted,
    filters,
    groupSlice,
    // A committed scrub cursor seeks pagination to a sort-field value;
    // remount Spotlight at the new AT location.
    scrubCursor,
    shouldRenderImaVidLooker,
    similarityParameters,
    view,
  ]);

  // the values reset the page, i.e. return to the top; a new sort reorders
  // the same items
  const pageReset = useMemoOne(() => {
    itemsReset;
    sort;
    return uuid();
  }, [itemsReset, sort]);

  // the item cache outlives a new sort, so its items can move to their places
  const gridReset = useMemoOne(() => {
    layoutReset;
    itemsReset;
    return uuid();
  }, [layoutReset, itemsReset]);

  const reset = useMemoOne(() => {
    gridReset;
    refresher;
    return uuid();
  }, [gridReset, refresher]);

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
