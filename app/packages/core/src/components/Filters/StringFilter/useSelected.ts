import * as fos from "@fiftyone/state";
import {
  RecoilValue,
  selectorFamily,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { isObjectIdField } from "../state";
import { CHECKBOX_LIMIT } from "../utils";
import { Result } from "./Result";
import useUseSearch from "./useUseSearch";

export type ResultsAtom = RecoilValue<{
  results: Result[];
  count: number | null;
}>;

const showSearchSelector = selectorFamily({
  key: "showSearch",
  get:
    (path: string) =>
    ({ get }) => {
      return get(isObjectIdField(path)) || get(fos.isLightningPath(path));
    },
});

const hasSearchResultsSelector = selectorFamily({
  key: "hasSearchResultsSelector",
  get:
    (path: string) =>
    ({ get }) => {
      return !get(isObjectIdField(path)) || !get(fos.isLightningPath(path));
    },
});

export default function (
  modal: boolean,
  path: string,
  resultsAtom: ResultsAtom
) {
  const lightning = useRecoilValue(fos.isLightningPath(path));
  const resultsLoadable = useRecoilValueLoadable(resultsAtom);
  const showSearch = useRecoilValue(showSearchSelector(path));
  const useSearch = useUseSearch({ modal, path });

  if (resultsLoadable.state === "hasError") throw resultsLoadable.contents;
  const results =
    resultsLoadable.state === "hasValue" ? resultsLoadable.contents : null;
  const shown = showSearch || (results?.results.length ?? 0 > CHECKBOX_LIMIT);

  return {
    lightning,
    loading: resultsLoadable.state === "loading",
    results,
    useSearch: useRecoilValue(hasSearchResultsSelector(path))
      ? useSearch
      : undefined,
    showSearch: shown,
  };
}
