import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
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
  const spaces = useRecoilValue(fos.sessionSpaces);
  const similarityParameters = useRecoilValue(fos.similarityParameters);
  const view = fos.filterView(useRecoilValue(fos.view));

  const refreshMemo = useMemo(() => {
    cropToContent;
    spaces;
  }, [cropToContent, spaces]);

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

  useEffect(() => subscribe((_, { reset }) => reset(gridPage)), []);

  return useMemo(() => {
    refreshMemo;
    resetMemo;
    return {};
  }, [refreshMemo, resetMemo]);
}
