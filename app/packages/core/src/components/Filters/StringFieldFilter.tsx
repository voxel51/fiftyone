import * as fos from "@fiftyone/state";
import {
  isMatchingAtom,
  stringExcludeAtom,
  stringSelectedValuesAtom,
} from "@fiftyone/state";
import React from "react";
import StringFilter from "./StringFilter";

const StringFieldFilter = ({
  path,
  modal,
  ...rest
}: {
  path: string;
  modal: boolean;
  named?: boolean;
  color: string;
  onFocus?: () => void;
  onBlur?: () => void;
  title: string;
}) => {
  return (
    <StringFilter
      excludeAtom={stringExcludeAtom({ modal, path })}
      isMatchingAtom={isMatchingAtom({ modal, path })}
      modal={modal}
      path={path}
      resultsAtom={fos.stringCountResults({
        modal,
        path,
        extended: false,
      })}
      selectedAtom={stringSelectedValuesAtom({ modal, path })}
      {...rest}
    />
  );
};

export default React.memo(StringFieldFilter);
