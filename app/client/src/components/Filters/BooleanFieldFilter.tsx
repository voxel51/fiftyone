import React from "react";
import {
  atomFamily,
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
  useRecoilValue,
} from "recoil";
import { animated } from "react-spring";

import * as selectors from "../../recoil/selectors";
import { NamedBooleanFilter } from "./BooleanFilter";
import { hasNoneField, useExpand } from "./utils";

type BooleanFilter = {
  false: boolean;
  true: boolean;
  none: boolean;
  _CLS: string;
};

const getFilter = (get: GetRecoilValue, path: string): BooleanFilter => {
  return {
    ...{
      true: true,
      false: true,
      none: true,
    },
    ...get(selectors.filterStage(path)),
  };
};

const meetsDefault = (filter: BooleanFilter) =>
  filter.true === true && filter.false === true && filter.none === true;

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
    _CLS: "bool",
  };
  if (meetsDefault(filter)) {
    set(selectors.filterStage(path), null);
  } else {
    set(selectors.filterStage(path), filter);
  }
};

const trueAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldTrue",
  get: (path) => ({ get }) => getFilter(get, path).true,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "true", value),
});

export const trueModalAtom = atomFamily<boolean, string>({
  key: "modalFilterBooleanFieldTrue",
  default: true,
});

const falseAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldFalse",
  get: (path) => ({ get }) => getFilter(get, path).false,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "false", value),
});

export const falseModalAtom = atomFamily<boolean, string>({
  key: "modalFilterBooleanFieldFalse",
  default: true,
});

const noneAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldNone",
  get: (path) => ({ get }) => getFilter(get, path).none,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "none", value),
});

const noneModalAtom = atomFamily<boolean, string>({
  key: "modalFilterBooleanFieldNone",
  default: true,
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
    return !get(none(path)) || !get(trueValue(path)) || !get(falseValue(path));
  },
});

const BooleanFieldFilter = ({ expanded, entry }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <NamedBooleanFilter
        name={"Boolean"}
        color={entry.color}
        hasNoneAtom={hasNoneField(entry.path)}
        trueAtom={trueAtom(entry.path)}
        falseAtom={falseAtom(entry.path)}
        noneAtom={noneAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(BooleanFieldFilter);
