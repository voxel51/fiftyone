import React from "react";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom } from "./BooleanFieldFilter.state";

const BooleanFieldFilter = ({
  path,
  modal,
}: {
  path: string;
  modal: boolean;
}) => {
  return (
    <CategoricalFilter<boolean | null>
      selectedValuesAtom={selectedValuesAtom({ path, modal })}
      countsAtom={countsAtom({ path, modal, filtered: false })}
      path={path}
    />
  );
};

export default React.memo(BooleanFieldFilter);
