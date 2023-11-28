import * as fos from "@fiftyone/state";
import {
  RecoilValue,
  selectorFamily,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import { isBooleanField } from "../state";
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
    ({ modal, path }: { modal: boolean; path: string }) =>
    ({ get }) => {
      if (!modal && get(fos.isLightningPath(path))) {
        return !get(isBooleanField(path));
      }

      return get(fos.isObjectIdField(path)) && !get(isBooleanField(path));
    },
});

const hasSearchResultsSelector = selectorFamily({
  key: "hasSearchResultsSelector",
  get:
    (path: string) =>
    ({ get }) => {
      return !get(fos.isObjectIdField(path)) || !get(fos.isLightningPath(path));
    },
});

export default function (
  modal: boolean,
  path: string,
  resultsAtom: ResultsAtom
) {
  const resultsLoadable = useRecoilValueLoadable(resultsAtom);
  const showSearch = useRecoilValue(showSearchSelector({ modal, path }));
  const useSearch = useUseSearch({ modal, path });

  if (resultsLoadable.state === "hasError") throw resultsLoadable.contents;
  const results =
    resultsLoadable.state === "hasValue" ? resultsLoadable.contents : null;
  const length = results?.results?.length ?? 0;
  const shown = showSearch || length > CHECKBOX_LIMIT;

  return {
    results,
    useSearch: useRecoilValue(hasSearchResultsSelector(path))
      ? useSearch
      : undefined,
    showSearch: Boolean(shown),
  };
}
