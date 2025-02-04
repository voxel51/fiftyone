import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { LRUCache } from "lru-cache";
import { useEffect, useMemo } from "react";
import uuid from "react-uuid";
import { useRecoilValue } from "recoil";
import { gridActivePathsLUT } from "../Sidebar/useDetectNewActiveLabelFields";
import { gridAt, gridOffset, gridPage } from "./recoil";

const MAX_LRU_CACHE_ITEMS = 510;

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
  const view = fos.filterView(useRecoilValue(fos.view));

  // only reload, attempt to return to the last grid location
  const layoutReset = useMemo(() => {
    cropToContent;
    fieldVisibilityStage;
    mediaField;
    refresher;
    return uuid();
  }, [cropToContent, fieldVisibilityStage, mediaField, refresher]);

  // the values reset the page, i.e. return to the top
  const pageReset = useMemo(() => {
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

  const reset = useMemo(() => {
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

  const lookerStore = useMemo(() => {
    /** LOOKER STORE REFRESHER */
    reset;
    /** LOOKER STORE REFRESHER */

    return new LRUCache<string, fos.Lookers>({
      dispose: (looker, id) => {
        looker.destroy();
        gridActivePathsLUT.delete(id);
      },
      max: MAX_LRU_CACHE_ITEMS,
      noDisposeOnSet: true,
    });
  }, [reset]);

  return {
    lookerStore,
    pageReset,
    reset,
  };
}
