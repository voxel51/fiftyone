import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
  temporalTagColor,
  temporalTagResults,
  useSyncTemporalTagResults,
} from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import StringFilter from "./StringFilter/StringFilter";

/**
 * Sidebar filter for temporal tags. Temporal tags live in a dedicated
 * collection (not sample fields), so the selectable values are fetched from the
 * multimodal tags REST endpoint and fed into the shared string filter. Selecting
 * values writes `{ values, exclude }` under the `_temporal_tags` key of the
 * filters atom, which the server resolves in `get_extended_view`.
 */
const TemporalTagsFilter = ({
  path,
  modal,
  ...rest
}: {
  color: string;
  path: string;
  modal: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
}) => {
  useSyncTemporalTagResults();
  const colorForTag = useRecoilValue(temporalTagColor);

  return (
    <StringFilter
      excludeAtom={stringExcludeAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      modal={modal}
      named={false}
      path={path}
      resultsAtom={temporalTagResults}
      selectedAtom={stringSelectedValuesAtom({ modal, path })}
      resultColor={(value) => colorForTag(value ?? "")}
      {...rest}
    />
  );
};

export default React.memo(TemporalTagsFilter);
