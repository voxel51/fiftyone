import React from "react";

import CategoricalFilter from "./CategoricalFilter";

import {
  booleanCountResults,
  booleanSelectedValuesAtom,
} from "@fiftyone/state";

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
