import {
  boolExcludeAtom,
  boolIsMatchingAtom,
  booleanCountResults,
  booleanSelectedValuesAtom,
} from "@fiftyone/state";
import React from "react";
import StringFilter from "./StringFilter";

const BooleanFieldFilter = ({
  path,
  modal,
  ...rest
}: {
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
      resultsAtom={booleanCountResults({
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
