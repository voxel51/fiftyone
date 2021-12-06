import React from "react";

import * as aggregationAtoms from "../../recoil/aggregations";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom, excludeAtom } from "./stringState";

const StringFieldFilter = ({
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
      {...rest}
    />
  );
};

export default React.memo(StringFieldFilter);
