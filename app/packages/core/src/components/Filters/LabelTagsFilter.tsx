import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import React from "react";
import { labelTagsCount } from "../Sidebar/Entries/EntryCounts";
import CategoricalFilter from "./StringFilter/StringFilter";

const LabelTagsFilter = ({
  path,
  modal,
  color,
  ...rest
}: {
  path: string;
  modal: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
}) => {
  return (
    <CategoricalFilter
      selectedValuesAtom={stringSelectedValuesAtom({ modal, path })}
      excludeAtom={stringExcludeAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      resultsAtom={labelTagsCount({ modal, extended: false })}
      path={path}
      modal={modal}
      {...rest}
    />
  );
};

export default React.memo(LabelTagsFilter);
