import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import { useRecoilValue } from "recoil";
import { gridPage } from "./recoil";

export default function useRefreshers() {
  const cropToContent = useRecoilValue(fos.cropToContent(false));
  const datasetName = useRecoilValue(fos.datasetName);
  const extendedStages = fos.stringifyObj(useRecoilValue(fos.extendedStages));
  const filters = fos.stringifyObj(useRecoilValue(fos.filters));
  const groupSlice = useRecoilValue(fos.groupSlice);
  const refresher = useRecoilValue(fos.refresher);
  const shouldRenderImaVidLooker = useRecoilValue(fos.shouldRenderImaVidLooker);
  const spaces = useRecoilValue(fos.sessionSpaces);
  const view = fos.filterView(useRecoilValue(fos.view));

  const layoutReset = useMemo(() => {
    cropToContent;
    refresher;
    spaces;
  }, [cropToContent, refresher, spaces]);

  const pageReset = useMemo(() => {
    datasetName;
    extendedStages;
    filters;
    groupSlice;
    shouldRenderImaVidLooker;
    view;
    return {};
  }, [
    datasetName,
    extendedStages,
    filters,
    groupSlice,
    shouldRenderImaVidLooker,
    view,
  ]);

  useEffect(() => subscribe((_, { reset }) => reset(gridPage)), []);

  return {
    layoutReset,
    pageReset,
  };
}
