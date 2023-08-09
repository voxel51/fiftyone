import React from "react";

import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import { labelTagsCount } from "../Sidebar/Entries/EntryCounts";
import CategoricalFilter from "./categoricalFilter/CategoricalFilter";

const LabelTagFieldFilter = ({
  path,
  modal,
  color,
  ...rest
}: {
  path: string;
  modal: boolean;
  name?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
  color: string;
}) => {
  return (
    <CategoricalFilter<{ value: string | null; count: number }>
      selectedValuesAtom={stringSelectedValuesAtom({ modal, path })}
      excludeAtom={stringExcludeAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      countsAtom={labelTagsCount({ modal, extended: false })}
      path={path}
      modal={modal}
      color={color}
      {...rest}
    />
  );
};

export default React.memo(LabelTagFieldFilter);
