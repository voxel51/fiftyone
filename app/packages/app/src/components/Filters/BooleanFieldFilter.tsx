import React from "react";

import * as aggregationAtoms from "../../recoil/aggregations";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom } from "./booleanState";

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
    <CategoricalFilter<boolean | null>
      selectedValuesAtom={selectedValuesAtom({ path, modal })}
      countsAtom={aggregationAtoms.booleanCountResults({
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
