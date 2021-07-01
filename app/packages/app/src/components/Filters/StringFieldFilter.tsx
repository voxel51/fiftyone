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
import CategoricalFilter from "./CategoricalFilter";
import { useExpand, countsAtom, Value } from "./utils";

export const LIST_LIMIT = 200;

interface StringFilter {
  values: string[];
  exclude: boolean;
  _CLS: "str";
}

const getFilter = (get: GetRecoilValue, path: string): StringFilter => {
  return {
    values: [],
    exclude: false,
    _CLS: "str",
    ...get(selectors.filterStage(path)),
  };
};

const meetsDefault = (filter: StringFilter) =>
  filter.values.length === 0 && filter.exclude === false;

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  path: string,
  key: string,
  value: boolean | string[] | DefaultValue
) => {
  const filter = {
    ...getFilter(get, path),
    [key]: value,
  };
  if (filter.values.length === 0) {
    filter.exclude = false;
  }
  if (meetsDefault(filter)) {
    set(selectors.filterStage(path), null);
  } else {
    set(selectors.filterStage(path), filter);
  }
};

export const selectedValuesAtom = selectorFamily<Value[], string>({
  key: "filterStringFieldValues",
  get: (path) => ({ get }) => getFilter(get, path).values,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "values", value),
});

export const selectedValuesModalAtom = atomFamily<Value[], string>({
  key: "modalFilterStringFieldValues",
  default: [],
});

export const excludeAtom = selectorFamily<boolean, string>({
  key: "filterStringFieldExclude",
  get: (path) => ({ get }) => getFilter(get, path).exclude,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "exclude", value),
});

export const excludeModalAtom = atomFamily<boolean, string>({
  key: "modalFilterStringFieldExclude",
  default: false,
});

export const modalFilter = selectorFamily<StringFilter | null, string>({
  key: "stringFieldModalFilter",
  get: (path) => ({ get }) => {
    const filter: StringFilter = {
      _CLS: "str",
      values: get(selectedValuesModalAtom(path)),
      exclude: get(excludeModalAtom(path)),
    };

    return meetsDefault(filter) ? null : filter;
  },
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "stringFieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    const values = modal ? selectedValuesModalAtom : selectedValuesAtom;
    const exclude = modal ? excludeModalAtom : excludeAtom;
    return get(values(path)).length > 0 || exclude(path);
  },
});

const StringFieldFilter = ({ expanded, entry, modal }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <CategoricalFilter
        valueName={entry.path}
        color={entry.color}
        selectedValuesAtom={
          modal
            ? selectedValuesModalAtom(entry.path)
            : selectedValuesAtom(entry.path)
        }
        excludeAtom={excludeAtom(entry.path)}
        countsAtom={countsAtom({ modal, path: entry.path })}
        path={entry.path}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(StringFieldFilter);
