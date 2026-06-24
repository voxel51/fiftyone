import * as fos from "@fiftyone/state";
import type { RecoilValue } from "recoil";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import { isAggregationTimeout } from "../../Common/TimedOutCounts";
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
  const id = useRecoilValue(fos.isObjectIdField(path));

  // a timed-out aggregation for this path degrades to a schema-only skeleton:
  // keep the search box so the user can still filter, just without counts
  const timedOut =
    resultsLoadable.state === "hasError" &&
    isAggregationTimeout(resultsLoadable.contents);
  if (resultsLoadable.state === "hasError" && !timedOut) {
    throw resultsLoadable.contents;
  }

  const results =
    resultsLoadable.state === "hasValue" ? resultsLoadable.contents : null;
  const length = results?.results?.length ?? 0;

  const shown =
    timedOut ||
    (!modal && queryPerformance) ||
    (resultsLoadable.state !== "loading" && (length >= CHECKBOX_LIMIT || id));
  const isFrameField = useRecoilValue(fos.isFrameField(path));

  return {
    results,
    timedOut,
    useSearch:
      path === "_label_tags" &&
      (queryPerformance || timedOut) &&
      !isFrameField &&
      !modal
        ? undefined
        : useSearch,
    showSearch: Boolean(shown) && !boolean,
  };
}
