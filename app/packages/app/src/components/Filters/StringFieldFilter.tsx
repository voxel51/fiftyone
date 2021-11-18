import React from "react";

import CategoricalFilter from "./CategoricalFilter";
import { selectedValuesAtom, excludeAtom } from "./stringState";

const StringFieldFilter = ({
  path,
  modal,
}: {
  path: string;
  modal: boolean;
}) => {
  return (
    <CategoricalFilter<string | null>
      selectedValuesAtom={selectedValuesAtom({ modal, path })}
      excludeAtom={excludeAtom({ modal, path })}
      path={path}
      modal={modal}
    />
  );
};

export default React.memo(StringFieldFilter);
