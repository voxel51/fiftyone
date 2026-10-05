import {
  boolExcludeAtom,
  boolIsMatchingAtom,
  booleanResults,
  booleanSelectedValuesAtom,
} from "@fiftyone/state";
import React from "react";
import StringFilter from "./StringFilter";

const BooleanFieldFilter = ({
  path,
  modal,
  ...rest
}: {
  // forwarded to StringFilter via rest (FilterItem passes it)
  color: string;
  modal: boolean;
  named?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  path: string;
  title: string;
}) => {
  return (
    <StringFilter
      selectedAtom={booleanSelectedValuesAtom({ path, modal })}
      isMatchingAtom={boolIsMatchingAtom({ path, modal })}
      excludeAtom={boolExcludeAtom({ path, modal })}
      resultsAtom={booleanResults({
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
