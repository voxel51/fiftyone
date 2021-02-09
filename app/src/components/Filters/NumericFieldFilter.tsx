import React, { useState } from "react";
import { animated } from "react-spring";
import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SerializableParam,
  SetRecoilState,
} from "recoil";

import * as selectors from "../../recoil/selectors";
import { NamedRangeSlider, Range } from "./RangeSlider";
import { useExpand } from "./utils";
import { AGGS } from "../../utils/labels";

type NumericFilter = {
  range: Range;
  none: boolean;
};

const getFilter = (get: GetRecoilValue, path: string): NumericFilter => {
  return {
    ...{
      range: [null, null],
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

export const boundsAtom = selectorFamily<
  Range,
  {
    path: string;
    defaultRange?: Range;
  }
>({
  key: "numericFieldBounds",
  get: ({ path, defaultRange }) => ({ get }) => {
    return (get(selectors.datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (cur.name === path && cur._CLS === AGGS.BOUNDS) {
          let { result: bounds } = cur;
          if (defaultRange) {
            const [minMax, maxMin] = defaultRange;
            bounds = [
              maxMin < bounds[0] ? maxMin : bounds[0],
              minMax > bounds[1] ? minMax : bounds[1],
            ];
          }
          return [
            bounds[0] !== null && bounds[0] !== 0
              ? Number((bounds[0] - 0.01).toFixed(2))
              : bounds[0],
            bounds[1] !== null && bounds[1] !== 1
              ? Number((bounds[1] + 0.01).toFixed(2))
              : bounds[1],
          ];
        }
        return acc;
      },
      [null, null]
    );
  },
});

export const rangeAtom = selectorFamily<Range, string>({
  key: "filterNumericFieldRange",
  get: (path) => ({ get }) => getFilter(get, path).range,
  set: (path) => ({ get, set }, range) =>
    setFilter(get, set, path, "range", range),
});

export const noneAtom = selectorFamily<boolean, string>({
  key: "filterNumericFieldNone",
  get: (path) => ({ get }) => getFilter(get, path).none,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "none", value),
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  {
    path: string;
    defaultRange?: Range;
  }
>({
  key: "numericFieldIsFiltered",
  get: ({ path, defaultRange }) => ({ get }) => {
    const none = !get(noneAtom(path));
    const range = get(rangeAtom(path));
    const bounds = get(boundsAtom({ path, defaultRange }));

    return (
      !none ||
      (bounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) &&
        bounds[0] !== bounds[1])
    );
  },
});

const NumericFieldFilter = ({ expanded, entry }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <NamedRangeSlider
        color={entry.color}
        name={"Range"}
        valueName={"value"}
        noneAtom={noneAtom(entry.path)}
        boundsAtom={boundsAtom({ path: entry.path })}
        rangeAtom={rangeAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(NumericFieldFilter);
