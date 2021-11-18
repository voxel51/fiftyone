import React from "react";

import * as aggregationAtoms from "../../recoil/aggregations";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom, excludeAtom } from "./stringState";

const StringFieldFilter = ({
  path,
  modal,
  named,
}: {
  path: string;
  modal: boolean;
  named?: boolean;
}) => {
  return (
    <CategoricalFilter<string | null>
      selectedValuesAtom={selectedValuesAtom({ modal, path })}
      excludeAtom={excludeAtom({ modal, path })}
      countsAtom={aggregationAtoms.stringCountResults({
        modal,
        path,
        extended: false,
      })}
      path={path}
      modal={modal}
      named={named}
    />
  );
};

export default React.memo(StringFieldFilter);
