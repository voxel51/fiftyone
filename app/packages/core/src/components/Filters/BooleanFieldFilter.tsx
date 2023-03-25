import React from "react";

import {
  booleanCountResults,
  booleanSelectedValuesAtom,
  boolIsMatchingAtom,
  boolOnlyMatchAtom,
  boolExcludeAtom,
} from "@fiftyone/state";
import CategoricalFilter from "./categoricalFilter/CategoricalFilter";

const BooleanFieldFilter = ({
  path,
  modal,
  ...rest
}: {
  path: string;
  modal: boolean;
  named?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
}) => {
  return (
    <CategoricalFilter<{ value: boolean | null; count: number }>
      selectedValuesAtom={booleanSelectedValuesAtom({ path, modal })}
      isMatchingAtom={boolIsMatchingAtom({ path, modal })}
      onlyMatchAtom={boolOnlyMatchAtom({ path, modal })}
      excludeAtom={boolExcludeAtom({ path, modal })}
      countsAtom={booleanCountResults({
        path,
        modal,
        extended: false,
      })}
      modal={modal}
      path={path}
      {...rest}
    />
  );
};

export default React.memo(BooleanFieldFilter);
