import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

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

  return useMemo(() => {
    cropToContent;
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
    cropToContent,
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
}
