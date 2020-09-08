import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import RangeSlider from "./RangeSlider";

const NumericFieldFilter = ({ entry }) => {
  const [range, setRange] = useRecoilState(
    atoms.filterNumericFieldRange(entry.name)
  );
  const bounds = useRecoilValue(selectors.numericFieldBounds(entry.name));

  const hasBounds = bounds.every((b) => b !== null);

  useEffect(() => setRange([...bounds]), [bounds]);

  return hasBounds ? (
    <RangeSlider
      rangeAtom={atoms.filterNumericFieldRange(entry.name)}
      boundsAtom={selectors.numericFieldBounds(entry.name)}
    />
  ) : null;
};

export default NumericFieldFilter;
