import React from "react";
import {
  atomFamily,
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import { animated } from "react-spring";
import uuid from "uuid-v4";

import * as selectors from "../../recoil/selectors";
import StringFilter from "./StringFilter";
import { AGGS } from "../../utils/labels";
import { useExpand, hasNoneField } from "./utils";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";

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

export const searchStringField = atomFamily<string, string>({
  key: "searchStringField",
  default: "",
});

export const searchStringFields = selectorFamily<
  { count: number; results: string[] },
  { path: string; limit?: number }
>({
  key: "searchStringFields",
  get: ({ path, limit = 15 }) => async ({ get }) => {
    const search = get(searchStringField(path));
    const id = uuid();

    const wrap = (handler) => ({ data }) => {
      data = JSON.parse(data);
      data.type === id && handler(data);
    };

    const promise = new Promise<{ count: number; results: string[] }>(
      (resolve) => {
        const listener = wrap(({ count, results }) => {
          socket.removeEventListener("message", listener);
          resolve({ count, results });
        });
        socket.addEventListener("message", listener);
        socket.send(
          packageMessage("distinct", { path, uuid: id, search, limit })
        );
      }
    );

    const result = await promise;
    return result;
  },
});

export const totalAtom = selectorFamily<number, string>({
  key: "stringFieldTotal",
  get: (path) => ({ get }) => {
    return (get(selectors.datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === path && cur._CLS === AGGS.DISTINCT_COUNT) {
        return cur.result;
      }
      return acc;
    }, null);
  },
});

export const valuesAtom = selectorFamily<
  { total: number; count: number; results: string[] },
  { path: string; limit?: number }
>({
  key: "stringFieldValues",
  get: ({ path, limit = 15 }) => ({ get }) => {
    const values = {
      total: get(totalAtom(path)),
      ...get(searchStringFields({ path, limit })),
    };

    if (get(hasNoneField(path))) {
      values.results = [null, ...values.results];
    }
    return values;
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
        valuesAtom={valuesAtom({ path: entry.path })}
        selectedValuesAtom={selectedValuesAtom(entry.path)}
        excludeAtom={excludeAtom(entry.path)}
        searchAtom={searchStringField(entry.path)}
        totalAtom={totalAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(StringFieldFilter);
