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
import StringFilter from "./StringFilter";
import { AGGS } from "../../utils/labels";
import { useExpand, hasNoneField } from "./utils";

export const LIST_LIMIT = 200;

type StringFilter = {
  values: string[];
  exclude: boolean;
  _CLS: string;
};

type Value = string | null;

const getFilter = (get: GetRecoilValue, path: string): StringFilter => {
  return {
    ...{
      values: [],
      exclude: false,
    },
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
    _CLS: "str",
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

export const totalAtom = selectorFamily<
  { count: number; results: string[] },
  string
>({
  key: "stringFieldTotal",
  get: (path) => ({ get }) => {
    const hasNone = get(hasNoneField(path));
    let stats = get(selectors.extendedDatasetStats);

    if (!stats || stats.length === 0) {
      stats = get(selectors.datasetStats);
    }
    const data = (stats ?? []).reduce(
      (acc, cur) => {
        if (cur.name === path && cur._CLS === AGGS.DISTINCT) {
          return {
            count: cur.result[0],
            results: cur.result[1],
          };
        }
        return acc;
      },
      { count: 0, results: [] }
    );

    if (hasNone) {
      data.count = data.count + 1;
      data.results = [...data.results, null].sort();
    }
    return data;
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

const StringFieldFilter = ({ expanded, entry }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <StringFilter
        valueName={entry.path}
        color={entry.color}
        selectedValuesAtom={selectedValuesAtom(entry.path)}
        excludeAtom={excludeAtom(entry.path)}
        totalAtom={totalAtom(entry.path)}
        hasNoneAtom={hasNoneField(entry.path)}
        path={entry.path}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(StringFieldFilter);
