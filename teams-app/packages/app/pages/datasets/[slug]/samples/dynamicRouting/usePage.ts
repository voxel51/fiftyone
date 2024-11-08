import { setPending } from "pages/state";
import { useEffect } from "react";
import { useErrorHandler } from "react-error-boundary";
import { atom, useRecoilState } from "recoil";
import { Page } from "./loadPageQuery";
import { getHistoryState } from "./state";
import {
  DatasetData,
  load,
  transition,
  transitionDataset,
  useGridReset,
} from "./transition";
import { useLocalSession } from "./useLocalSession";
import useSetters from "./useSetters";

export const [datasetPage, resetPage] = (() => {
  let reset: () => void;

  const page = atom<Page | null>({
    key: "datasetPage",
    default: null,
    effects: [
      ({ setSelf }) => {
        reset = () => setSelf(null);
      },
    ],
    dangerouslyAllowMutability: true,
  });

  return [page, () => reset?.()];
})();

let ref: ((page: Page) => void) | null = null;

export const pageRunner = (page: Page) => {
  if (!ref) {
    throw new Error("runner not defined");
  }
  ref(page);
};

const usePage = (dataset: DatasetData) => {
  const [page, setPage] = useRecoilState(datasetPage);
  const setters = useSetters(dataset);
  const snapshotId = page?.snapshotData?.dataset?.snapshot?.id;
  useLocalSession(dataset.datasetId, snapshotId);
  const handleError = useErrorHandler();
  // extra setup to ensure grid resets between datasets
  const resetGrid = useGridReset();

  useEffect(() => {
    // load() will run on the initial visit to /dataset/[slug]/samples
    // subsequent renders will have 'ref' defined, so we transition
    resetGrid().then(() => {
      ref
        ? transitionDataset(dataset).catch(handleError)
        : load(dataset).then(setPage).catch(handleError);
    });
  }, [dataset, handleError, resetGrid, setPage]);

  useEffect(() => {
    const run = () => {
      try {
        // getHistoryState will throw if it is not a /dataset/[slug]/samples
        // history entry
        const state = getHistoryState();
        setPending();
        transition(state);
      } catch {}
    };

    addEventListener("popstate", run);

    return () => removeEventListener("popstate", run);
  }, []);

  return {
    page,
    setters,
    subscribe: (fn: (page: Page) => void) => {
      ref = fn;
      return () => null;
    },
  };
};

export default usePage;
