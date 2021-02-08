import React, { useState } from "react";
import { selectorFamily } from "recoil";

import * as selectors from "../../recoil/selectors";
import { NamedBooleanFilter } from "./StringFilter";
import { animated, useSpring } from "react-spring";
import useMeasure from "react-use-measure";

const trueAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldTrue",
  get: (path) => ({ get }) => {
    const filter = get(selectors.filterStage(path));
    return filter?.true ?? true;
  },
  set: (path) => ({ get, set }, trueValue) => {
    set(selectors.filterStage(path), {
      true: trueValue,
      false: get(falseAtom(path)),
      none: get(noneAtom(path)),
    });
  },
});

const falseAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldFalse",
  get: (path) => ({ get }) => {
    const filter = get(selectors.filterStage(path));
    return filter?.true ?? true;
  },
  set: (path) => ({ get, set }, falseValue) => {
    set(selectors.filterStage(path), {
      true: get(trueAtom(path)),
      false: falseValue,
      none: get(noneAtom(path)),
    });
  },
});

const noneAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldNone",
  get: (path) => ({ get }) => {
    const filter = get(filterStage(path));
    return filter?.none ?? true;
  },
  set: (path) => ({ get, set }, none) => {
    set(selectors.filterStage(path), {
      true: get(trueAtom(path)),
      false: get(falseAtom(path)),
      none,
    });
  },
});

const BooleanFieldFilter = ({ expanded, entry }) => {
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
      <NamedBooleanFilter
        name={"Values"}
        valueName={"value"}
        color={entry.color}
        trueAtom={trueAtom(entry.path)}
        falseAtom={falseAtom(entry.path)}
        includeNoneAtom={noneAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(BooleanFieldFilter);
