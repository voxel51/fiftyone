import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import React from "react";
import { labelTagsCount } from "../Sidebar/Entries/EntryCounts";
import StringFilter from "./StringFilter";

const LabelTagsFilter = ({
  path,
  modal,
  ...rest
}: {
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
      resultsAtom={labelTagsCount({ modal, extended: false })}
      selectedAtom={stringSelectedValuesAtom({ modal, path })}
      {...rest}
    />
  );
};

export default React.memo(LabelTagsFilter);
