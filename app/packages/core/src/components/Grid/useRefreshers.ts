import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import { useMemoOne } from "use-memo-one";
import { gridAt, gridOffset, gridPage } from "./recoil";

export default function useRefreshers() {
  const cropToContent = useRecoilValue(fos.cropToContent(false));
  const datasetName = useRecoilValue(fos.datasetName);
  const extendedStagesUnsorted = fos.stringifyObj(
    useRecoilValue(fos.extendedStagesUnsorted)
  );
  const fieldVisibilityStage = fos.stringifyObj(
    useRecoilValue(fos.fieldVisibilityStage) || {}
  );
  const filters = fos.stringifyObj(useRecoilValue(fos.filters));
  const groupSlice = useRecoilValue(fos.groupSlice);
  const mediaField = useRecoilValue(fos.selectedMediaField(false));
  const refresher = useRecoilValue(fos.refresher);
  const similarityParameters = fos.stringifyObj(
    useRecoilValue(fos.similarityParameters) || {}
  );
  const shouldRenderImaVidLooker = useRecoilValue(
    fos.shouldRenderImaVidLooker(false)
  );
  const view = fos.filterView(useRecoilValue(fos.view) ?? []);

  // only reload, attempt to return to the last grid location
  const layoutReset = useMemoOne(() => {
    cropToContent;
    fieldVisibilityStage;
    mediaField;
    refresher;
    return uuid();
  }, [cropToContent, fieldVisibilityStage, mediaField, refresher]);

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
