import * as fos from "@fiftyone/state";
import type { RecoilValue } from "recoil";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { isBooleanField } from "../state";
import { CHECKBOX_LIMIT } from "../utils";
import type { Result } from "./Result";
import useUseSearch from "./useUseSearch";

export type ResultsAtom = RecoilValue<{
  results: Result[];
  count: number | null;
}>;

export default function (
  modal: boolean,
  path: string,
  resultsAtom: ResultsAtom
) {
  const resultsLoadable = useRecoilValueLoadable(resultsAtom);
  const boolean = useRecoilValue(isBooleanField(path));
  const useSearch = useUseSearch({ modal, path });
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  if (resultsLoadable.state === "hasError") throw resultsLoadable.contents;
  const results =
    resultsLoadable.state === "hasValue" ? resultsLoadable.contents : null;
  const length = results?.results?.length ?? 0;

  const shown =
    (!modal && queryPerformance) ||
    (resultsLoadable.state !== "loading" && length >= CHECKBOX_LIMIT);

  return {
    results,

    useSearch:
      path === "_label_tags" && queryPerformance && !modal
        ? undefined
        : useSearch,
    showSearch: Boolean(shown) && !boolean,
  };
}
