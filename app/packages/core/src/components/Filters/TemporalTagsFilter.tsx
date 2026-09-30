import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
  temporalTagCounts,
} from "@fiftyone/state";
import React from "react";
import StringFilter from "./StringFilter/StringFilter";

/**
 * Sidebar filter for temporal tags. Temporal tags live in a dedicated
 * collection (not sample fields), so the selectable values come from their own
 * aggregation, scoped to the view like any other sidebar count. Selecting
 * values writes `{ values, exclude }` under the `_temporal_tags` key of the
 * filters atom, which the server resolves in `get_extended_view`.
 *
 * The value dots are left to the shared string filter: temporal tags follow
 * the app's color-by setting like any other path, so there is nothing
 * tag-specific left to override.
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
  return (
    <StringFilter
      excludeAtom={stringExcludeAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      modal={modal}
      named={false}
      path={path}
      resultsAtom={temporalTagCounts({ modal, extended: false })}
      selectedAtom={stringSelectedValuesAtom({ modal, path })}
      {...rest}
    />
  );
};

export default React.memo(TemporalTagsFilter);
