import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useGridSelectionRequest } from "@fiftyone/state/src/selection";
import { useEffect } from "react";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { gridAt, gridOffset, gridPage } from "./recoil";
import { useGridJumpRevision } from "./useScrollLocation";

export default function useRefreshers() {
  const { key: selectionScopeKey } = useGridSelectionRequest();
  const cropToContent = useRecoilValue(fos.cropToContent(false));
  const datasetName = useRecoilValue(fos.datasetName);
  const extendedStagesUnsorted = fos.stringifyObj(
    useRecoilValue(fos.extendedStagesUnsorted),
  );
  const fieldVisibilityStage = fos.stringifyObj(
    useRecoilValue(fos.fieldVisibilityStage) || {},
  );
  const filters = fos.stringifyObj(useRecoilValue(fos.filters));
  const groupSlice = useRecoilValue(fos.groupSlice);
  const mediaField = useRecoilValue(fos.selectedMediaField(false));
  const queryPerformanceSetting = useRecoilValue(fos.queryPerformanceSetting);
  const refresher = useRecoilValue(fos.refresher);
  const jump = useGridJumpRevision();
  const shouldRenderImaVidLooker = useRecoilValue(
    fos.shouldRenderImaVidLooker(false),
  );
  const similarityParameters = fos.stringifyObj(
    useRecoilValue(fos.similarityParameters) || {},
  );
  const sort = useRecoilValue(fos.gridSortBy);
  const view = fos.filterView(useRecoilValue(fos.view) ?? []);

  // only reload, attempt to return to the last grid location (or the one
  // a jump just wrote)
  const layoutReset = useMemoOne(() => {
    cropToContent;
    fieldVisibilityStage;
    jump;
    mediaField;
    queryPerformanceSetting;
    refresher;
    return uuid();
  }, [
    cropToContent,
    fieldVisibilityStage,
    jump,
    mediaField,
    queryPerformanceSetting,
    refresher,
  ]);

  // the values reset the page, i.e. return to the top
  const pageReset = useMemoOne(() => {
    datasetName;
    extendedStagesUnsorted;
    filters;
    groupSlice;
    shouldRenderImaVidLooker;
    similarityParameters;
    view;
    return uuid();
  }, [
    selectionScopeKey,
    datasetName,
    extendedStagesUnsorted,
    filters,
    groupSlice,
    shouldRenderImaVidLooker,
    similarityParameters,
    sort,
    view,
  ]);

  const reset = useMemoOne(() => {
    layoutReset;
    pageReset;
    return uuid();
  }, [layoutReset, pageReset]);

  useEffect(() => {
    const unsubscribe = subscribe(({ event }, { reset }) => {
      if (event === "fieldVisibility") return;

      // if not a modal page change, reset the grid location
      reset(gridAt);
      reset(gridPage);
      reset(gridOffset);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    pageReset,
    reset,
  };
}
