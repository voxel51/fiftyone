import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";

const NumericFieldFilter = ({ entry }) => {
  return (
    <NamedRangeSlider
      color={entry.color}
      name={"Range"}
      valueName={"value"}
      includeNoneAtom={atoms.filterNumericFieldIncludeNone(entry.name)}
      boundsAtom={selectors.numericFieldBounds(entry.name)}
      rangeAtom={atoms.filterNumericFieldRange(entry.name)}
    />
  );
};

export default NumericFieldFilter;
