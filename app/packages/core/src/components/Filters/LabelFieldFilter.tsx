import React from "react";

import {
  isMatchingAtom,
  onlyMatchAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import CategoricalFilter from "./categoricalFilter/CategoricalFilter";
import { labelTagsCount } from "../Sidebar/Entries/EntryCounts";

const LabelTagFieldFilter = ({
  path,
  modal,
  ...rest
}: {
  path: string;
  modal: boolean;
  name?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
}) => {
  return (
    <CategoricalFilter<{ value: string | null; count: number }>
      selectedValuesAtom={stringSelectedValuesAtom({ modal, path })}
      excludeAtom={stringExcludeAtom({ modal, path })}
      onlyMatchAtom={onlyMatchAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      countsAtom={labelTagsCount({ modal, extended: false })}
      path={path}
      modal={modal}
      {...rest}
    />
  );
};

export default React.memo(LabelTagFieldFilter);
