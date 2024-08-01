import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo } from "react";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import { gridAt, gridPage } from "./recoil";

export default function useRefreshers() {
  const cropToContent = useRecoilValue(fos.cropToContent(false));
  const datasetName = useRecoilValue(fos.datasetName);
  const extendedStages = fos.stringifyObj(useRecoilValue(fos.extendedStages));
  const filters = fos.stringifyObj(useRecoilValue(fos.filters));
  const groupSlice = useRecoilValue(fos.groupSlice);
  const refresher = useRecoilValue(fos.refresher);
  const shouldRenderImaVidLooker = useRecoilValue(fos.shouldRenderImaVidLooker);
  const view = fos.filterView(useRecoilValue(fos.view));

  // only reload, attempt to return to the last grid location
  const layoutReset = useMemo(() => {
    cropToContent;
    refresher;
    return uuid();
  }, [cropToContent, refresher]);

  // the values reset the page, i.e. return to the top
  const pageReset = useMemo(() => {
    datasetName;
    extendedStages;
    filters;
    groupSlice;
    shouldRenderImaVidLooker;
    view;
    return uuid();
  }, [
    datasetName,
    extendedStages,
    filters,
    groupSlice,
    shouldRenderImaVidLooker,
    view,
  ]);

  const reset = useMemo(() => {
    layoutReset;
    pageReset;
    return uuid();
  }, [layoutReset, pageReset]);

  useEffect(
    () =>
      subscribe(({ event }, { reset }) => {
        if (event === "modal") return;

        // if not a modal page change, reset the grid location
        reset(gridPage);
        reset(gridAt);
      }),
    []
  );

  return {
    pageReset,
    reset,
  };
}
