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
import { useExpand, countsAtom, Value } from "./utils";
import CategoricalFilter from "./CategoricalFilter";

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

export const modalFilter = selectorFamily<BooleanFilter | null, string>({
  key: "booleanFieldModalFilter",
  get: (path) => ({ get }) => {
    const filter: BooleanFilter = {
      _CLS: "bool",
      false: get(falseModalAtom(path)),
      true: get(trueModalAtom(path)),
      none: get(noneModalAtom(path)),
    };

    return meetsDefault(filter) ? null : filter;
  },
});

const selectedValuesAtom = selectorFamily<
  Value[],
  { modal: boolean; path: string }
>({
  key: "booleanSelectedValues",
  get: ({ modal, path }) => ({ get }) => {
    const values: Value[] = [];

    if (get(modal ? noneModalAtom(path) : noneAtom(path))) {
      values.push(null);
    }

    if (get(modal ? falseModalAtom(path) : falseAtom(path))) {
      values.push(false);
    }

    if (get(modal ? trueModalAtom(path) : trueAtom(path))) {
      values.push(true);
    }

    return values;
  },
  set: ({ path, modal }) => ({ get, set }, values) => {
    const noneA = modal ? noneModalAtom(path) : noneAtom(path);
    const falseA = modal ? falseModalAtom(path) : falseAtom(path);
    const trueA = modal ? trueModalAtom(path) : trueAtom(path);

    const currentNone = get(noneA);
    const currentFalse = get(falseA);
    const currentTrue = get(trueA);

    if (!Array.isArray(values)) {
      currentNone && set(noneA, false);
      currentFalse && set(falseA, false);
      currentTrue && set(trueA, false);
      return;
    }

    const newNone = values.includes(null);
    if (newNone !== currentNone) {
      set(noneA, newNone);
    }

    const newFalse = values.includes(false);
    if (newFalse !== currentFalse) {
      set(falseA, newFalse);
    }

    const newTrue = values.includes(true);
    if (newTrue !== currentTrue) {
      set(trueA, newTrue);
    }
  },
});

const BooleanFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <CategoricalFilter
        valueName={entry.path}
        color={entry.color}
        selectedValuesAtom={selectedValuesAtom({ path: entry.path, modal })}
        countsAtom={countsAtom({ path: entry.path, modal })}
        path={entry.path}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(BooleanFieldFilter);
