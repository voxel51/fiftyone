import { useLayoutEffect, useState } from "react";
import { atom, selector, useRecoilCallback, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import socket from "../shared/connection";
import { useMessageHandler } from "../utils/hooks";
import tile, { State } from "../utils/tile";
import { packageMessage } from "../utils/socket";
import { filterView } from "../utils/view";
import { zoomAspectRatio } from "@fiftyone/looker";
import { filterStages } from "./Filters/atoms";

export const gridZoom = atom<number | null>({
  key: "gridZoom",
  default: selectors.defaultGridZoom,
});

const gridRowAspectRatio = selector<number>({
  key: "gridRowAspectRatio",
  get: ({ get }) => {
    return 11 - get(gridZoom);
  },
});

const pageSize = selector<number>({
  key: "pageSize",
  get: ({ get }) => Math.ceil(get(gridRowAspectRatio) * 4),
});

const stringifyObj = (obj) => {
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;
  return JSON.stringify(
    Object.keys(obj)
      .map((key) => {
        return [key, obj[key]];
      })
      .sort((a, b) => a[0] - b[0])
  );
};

export default (): [State, (state: State) => void] => {
  const filters = useRecoilValue(filterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const refresh = useRecoilValue(selectors.refresh);
  const pageSizeValue = useRecoilValue(pageSize);
  const cropToContent = useRecoilValue(atoms.cropToContent(false));
  const [state, setState] = useState({
    loadMore: false,
    isLoading: false,
    hasMore: true,
    pageToLoad: 1,
  });

  const handlePage = useRecoilCallback(
    ({ snapshot, set }) => async ({ results, more }) => {
      const rows = await snapshot.getPromise(atoms.gridRows);
      const ratio = await snapshot.getPromise(gridRowAspectRatio);
      const isPatchesView = await snapshot.getPromise(selectors.isPatchesView);
      const cropToContent = await snapshot.getPromise(
        atoms.cropToContent(false)
      );
      results.forEach((sample) => {
        sample.aspect_ratio =
          isPatchesView && cropToContent
            ? zoomAspectRatio(sample.sample, sample.width / sample.height)
            : sample.width / sample.height;
      });
      const [newState, newRows] = tile(results, more, state, rows, ratio);

      results.forEach(({ sample, width, height, frame_rate, aspect_ratio }) => {
        set(atoms.sample(sample._id), sample);
        set(atoms.sampleMetadata(sample._id), {
          width,
          height,
          frameRate: frame_rate,
          aspectRatio: aspect_ratio,
        });
      });
      setState({ ...newState, pageToLoad: state.pageToLoad + 1 });
      set(atoms.gridRows, newRows);
    },
    [state]
  );

  useMessageHandler("page", handlePage);

  const clearPage = useRecoilCallback(
    ({ snapshot, reset }) => async () => {
      setState({
        loadMore: false,
        isLoading: false,
        hasMore: true,
        pageToLoad: 1,
      });
      const clearSample = (id) => {
        reset(atoms.sample(id));
        reset(atoms.sampleMetadata(id));
      };
      reset(atoms.gridRows);
      const rows = await snapshot.getPromise(atoms.gridRows);
      rows.rows.forEach(({ samples }) => samples.forEach(clearSample));
      rows.remainder.forEach(({ sample }) => clearSample(sample._id));
    },
    []
  );

  const requestPage = useRecoilCallback(
    ({ snapshot }) => async (pageToLoad) => {
      const page_length = await snapshot.getPromise(pageSize);
      socket.send(packageMessage("page", { page: pageToLoad, page_length }));
    }
  );

  useLayoutEffect(() => {
    clearPage();
  }, [
    filterView(view),
    datasetName,
    refresh,
    stringifyObj(filters),
    pageSizeValue,
    cropToContent,
  ]);

  useLayoutEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({
      ...state,
      isLoading: true,
      loadMore: false,
    });
    requestPage(state.pageToLoad);
  }, [state.isLoading, state.hasMore, state.loadMore]);

  return [state, setState];
};
