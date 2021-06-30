import React from "react";
import {
  atomFamily,
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import { animated } from "react-spring";

import * as selectors from "../../recoil/selectors";
import BooleanFilter from "./BooleanFilter";
import { noneCount, useExpand } from "./utils";
import StringFilter from "./StringFilter";

interface BooleanFilter {
  false: boolean;
  true: boolean;
  none: boolean;
  _CLS: "bool";
}

const getFilter = (get: GetRecoilValue, path: string): BooleanFilter => {
  return {
    _CLS: "bool",
    true: false,
    false: false,
    none: false,
    ...get(selectors.filterStage(path)),
  };
};

const meetsDefault = (filter: BooleanFilter) =>
  filter.true === false && filter.false === false && filter.none === false;

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  path: string,
  key: string,
  value: boolean | DefaultValue
) => {
  const filter = {
    ...getFilter(get, path),
    [key]: value,
  };
  if (meetsDefault(filter)) {
    set(selectors.filterStage(path), null);
  } else {
    set(selectors.filterStage(path), filter);
  }
};

export const trueAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldTrue",
  get: (path) => ({ get }) => getFilter(get, path).true,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "true", value),
});

export const trueModalAtom = atomFamily<boolean, string>({
  key: "modalFilterBooleanFieldTrue",
  default: false,
});

export const falseAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldFalse",
  get: (path) => ({ get }) => getFilter(get, path).false,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "false", value),
});

export const falseModalAtom = atomFamily<boolean, string>({
  key: "modalFilterBooleanFieldFalse",
  default: false,
});

export const noneAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldNone",
  get: (path) => ({ get }) => getFilter(get, path).none,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "none", value),
});

export const noneModalAtom = atomFamily<boolean, string>({
  key: "modalFilterBooleanFieldNone",
  default: false,
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "booleanFieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    const [none, trueValue, falseValue] = modal
      ? [noneModalAtom, trueModalAtom, falseModalAtom]
      : [noneAtom, trueAtom, falseAtom];
    return get(none(path)) || get(trueValue(path)) || get(falseValue(path));
  },
});

const BooleanFieldFilter = ({ expanded, entry }) => {
  const [ref, props] = useExpand(expanded);
  return null;

  return (
    <animated.div style={props}>
      <StringFilter
        valueName={entry.path}
        color={entry.color}
        selectedValuesAtom={selectedValuesAtom(entry.path)}
        totalAtom={totalAtom(entry.path)}
        noneCountAtom={noneCount(entry.path)}
        path={entry.path}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(BooleanFieldFilter);
