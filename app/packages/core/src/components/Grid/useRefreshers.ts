import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import uuid from "react-uuid";
import { useReverbValue } from "@fiftyone/reverb";
import { useMemoOne } from "use-memo-one";
import { gridAt, gridOffset, gridPage } from "./atoms";

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

  // only reload, attempt to return to the last grid location
  const layoutReset = useMemoOne(() => {
    cropToContent;
    fieldVisibilityStage;
    mediaField;
    queryPerformanceSetting;
    refresher;
    return uuid();
  }, [
    cropToContent,
    fieldVisibilityStage,
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
