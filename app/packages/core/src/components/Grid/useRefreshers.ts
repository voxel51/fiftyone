import * as fos from "@fiftyone/state";
import { useLayoutEffect, useMemo } from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import { gridPage } from "./recoil";

export default function useRefreshers() {
  const cropToContent = useRecoilValue(fos.cropToContent(false));
  const datasetName = useRecoilValue(fos.datasetName);
  const extendedStagesUnsorted = useRecoilValue(fos.extendedStagesUnsorted);
  const extendedStages = useRecoilValue(fos.extendedStages);
  const filters = fos.stringifyObj(useRecoilValue(fos.filters));
  const groupSlice = useRecoilValue(fos.groupSlice);
  const refresher = useRecoilValue(fos.refresher);
  const shouldRenderImaVidLooker = useRecoilValue(fos.shouldRenderImaVidLooker);
  const similarityParameters = useRecoilValue(fos.similarityParameters);
  const view = fos.filterView(useRecoilValue(fos.view));

  const refreshMemo = useMemo(() => {
    cropToContent;
  }, [cropToContent]);

  const resetMemo = useMemo(() => {
    datasetName;
    extendedStages;
    extendedStagesUnsorted;
    filters;
    groupSlice;
    refresher;
    shouldRenderImaVidLooker;
    similarityParameters;
    view;
    return {};
  }, [
    datasetName,
    extendedStages,
    extendedStagesUnsorted,
    filters,
    groupSlice,
    refresher,
    shouldRenderImaVidLooker,
    similarityParameters,
    view,
  ]);

  const resetPage = useResetRecoilState(gridPage);
  useLayoutEffect(() => {
    resetPage();
  }, [resetPage]);

  return useMemo(() => {
    refreshMemo;
    resetMemo;
    return {};
  }, [refreshMemo, resetMemo]);
}
