import * as fos from "@fiftyone/state";
import {
  type ReverbValue,
  useReverbValue,
  useReverbValueLoadable,
} from "@fiftyone/reverb";
import { isBooleanField } from "../state";
import { CHECKBOX_LIMIT } from "../utils";
import type { Result } from "./Result";
import useUseSearch from "./useUseSearch";

export type ResultsAtom = ReverbValue<{
  results: Result[];
  count: number | null;
}>;

export default function (
  modal: boolean,
  path: string,
  resultsAtom: ResultsAtom,
) {
  const resultsLoadable = useReverbValueLoadable(resultsAtom);
  const boolean = useReverbValue(isBooleanField(path));
  const useSearch = useUseSearch({ modal, path });
  const queryPerformance = useReverbValue(fos.queryPerformance);
  const id = useReverbValue(fos.isObjectIdField(path));
  if (resultsLoadable.state === "hasError") throw resultsLoadable.contents;
  const results =
    resultsLoadable.state === "hasValue" ? resultsLoadable.contents : null;
  const length = results?.results?.length ?? 0;

  const shown =
    (!modal && queryPerformance) ||
    (resultsLoadable.state !== "loading" && (length >= CHECKBOX_LIMIT || id));
  const isFrameField = useReverbValue(fos.isFrameField(path));

  return {
    results,
    useSearch:
      path === "_label_tags" && queryPerformance && !isFrameField && !modal
        ? undefined
        : useSearch,
    showSearch: Boolean(shown) && !boolean,
  };
}
