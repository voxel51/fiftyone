import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { NamedRangeSlider } from "./RangeSlider";

const NumericFieldFilter = ({ entry }) => {
  const boundsAtom = selectors.numericFieldBounds(entry.name);
  const rangeAtom = atoms.filterNumericFieldRange(entry.name);
  const [stateDescription, setStateDescription] = useRecoilState(
    atoms.stateDescription
  );
  const bounds = useRecoilValue(boundsAtom);
  const [range, setRange] = useRecoilState(rangeAtom);
  const hasBounds = bounds.every((b) => b !== null);
  useEffect(() => {
    hasBounds && range.every((r) => r === null) && setRange([...bounds]);
  }, [bounds]);
  console.log(stateDescription);
  return (
    <NamedRangeSlider
      color={entry.color}
      name={"Range"}
      valueName={"value"}
      includeNoneAtom={atoms.filterNumericFieldIncludeNone(entry.name)}
      boundsAtom={boundsAtom}
      rangeAtom={rangeAtom}
    />
  );
};

export default NumericFieldFilter;
