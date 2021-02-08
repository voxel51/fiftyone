import React, { useState } from "react";
import { animated, useSpring } from "react-spring";
import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import useMeasure from "react-use-measure";

import * as selectors from "../../recoil/selectors";
import { NamedRangeSlider, Range } from "./RangeSlider";

type NumericFilter = {
  range: Range;
  none: boolean;
};

const getFilter = (get: GetRecoilValue, path: string): NumericFilter => {
  return {
    ...{
      range: [undefined, undefined],
      none: true,
    },
    ...get(selectors.filterStage(path)),
  };
};

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  path: string,
  key: string,
  value: boolean | Range | DefaultValue
) => {
  set(selectors.filterStage(path), {
    ...getFilter(get, path),
    [key]: value,
  });
};

const rangeAtom = selectorFamily<Range, string>({
  key: "filterNumericFieldRange",
  get: (path) => ({ get }) => getFilter(get, path).range,
  set: (path) => ({ get, set }, range) =>
    setFilter(get, set, path, "range", range),
});

const noneAtom = selectorFamily<boolean, string>({
  key: "filterNumericFieldNone",
  get: (path) => ({ get }) => getFilter(get, path).none,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "none", value),
});

const NumericFieldFilter = ({ expanded, entry }) => {
  const [overflow, setOverflow] = useState("hidden");

  const [ref, { height }] = useMeasure();
  const props = useSpring({
    height: expanded ? height : 0,
    from: {
      height: 0,
    },
    onStart: () => !expanded && setOverflow("hidden"),
    onRest: () => expanded && setOverflow("visible"),
  });

  return (
    <animated.div style={{ ...props, overflow }}>
      <NamedRangeSlider
        color={entry.color}
        name={"Range"}
        valueName={"value"}
        noneAtom={noneAtom(entry.path)}
        boundsAtom={selectors.numericFieldBounds(entry.path)}
        rangeAtom={rangeAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
