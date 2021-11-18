import React from "react";

import * as aggregationAtoms from "../../recoil/aggregations";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom } from "./booleanState";

const BooleanFieldFilter = ({
  path,
  named,
  modal,
}: {
  path: string;
  modal: boolean;
  named?: boolean;
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
      named={named}
    />
  );
};

export default React.memo(BooleanFieldFilter);
