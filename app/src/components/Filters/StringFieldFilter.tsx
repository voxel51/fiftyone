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
import { NamedStringFilter } from "./StringFilter";
import { AGGS } from "../../utils/labels";
import { useExpand } from "./utils";

type StringFilter = {
  values: string[];
  none: boolean;
};

const getFilter = (get: GetRecoilValue, path: string): StringFilter => {
  return {
    ...{
      values: [],
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
  value: boolean | string[] | DefaultValue
) => {
  set(selectors.filterStage(path), {
    ...getFilter(get, path),
    [key]: value,
    _cls: "str",
  });
};

export const selectedValuesAtom = selectorFamily<string[], string>({
  key: "filterStringFieldValues",
  get: (path) => ({ get }) => getFilter(get, path).values,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "values", value),
});

export const selectedValuesModalAtom = atomFamily<string[], string>({
  key: "modalFilterStringFieldValues",
  default: [],
});

export const noneAtom = selectorFamily<boolean, string>({
  key: "filterStringFieldNone",
  get: (path) => ({ get }) => getFilter(get, path).none,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "none", value),
});

export const noneModalAtom = atomFamily<boolean, string>({
  key: "modalFilterStringFieldNone",
  default: true,
});

export const valuesAtom = selectorFamily<string[], string>({
  key: "stringFieldValues",
  get: (path) => ({ get }) => {
    const i = (get(selectors.datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === path && cur._CLS === AGGS.DISTINCT) {
        return cur.result;
      }
      return acc;
    }, []);
    return i;
  },
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "stringFieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    const [none, values] = modal
      ? [noneModalAtom, selectedValuesModalAtom]
      : [noneAtom, selectedValuesAtom];
    return !get(none(path)) || Boolean(get(values(path)).length);
  },
});

const StringFieldFilter = ({ expanded, entry }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <NamedStringFilter
        name={"Values"}
        valueName={"value"}
        color={entry.color}
        selectedValuesAtom={selectedValuesAtom(entry.path)}
        valuesAtom={valuesAtom(entry.path)}
        noneAtom={noneAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(StringFieldFilter);
