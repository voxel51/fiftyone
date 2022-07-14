import React from "react";

import * as fos from "@fiftyone/state";

import CategoricalFilter from "./CategoricalFilter";
import { stringExcludeAtom, stringSelectedValuesAtom } from "@fiftyone/state";

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
    <CategoricalFilter<{ value: string | null; count: number }>
      selectedValuesAtom={stringSelectedValuesAtom({ modal, path })}
      excludeAtom={stringExcludeAtom({ modal, path })}
      countsAtom={fos.stringCountResults({
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
