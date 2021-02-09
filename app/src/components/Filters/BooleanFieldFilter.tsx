import React, { useState } from "react";
import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import { animated } from "react-spring";

import * as selectors from "../../recoil/selectors";
import { NamedBooleanFilter } from "./BooleanFilter";
import { useExpand } from "./utils";

type BooleanFilter = {
  false: boolean;
  true: boolean;
  none: boolean;
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

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  path: string,
  key: string,
  value: boolean | DefaultValue
) => {
  set(selectors.filterStage(path), {
    ...getFilter(get, path),
    [key]: value,
  });
};

const trueAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldTrue",
  get: (path) => ({ get }) => getFilter(get, path).true,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "true", value),
});

const falseAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldFalse",
  get: (path) => ({ get }) => getFilter(get, path).false,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "false", value),
});

const noneAtom = selectorFamily<boolean, string>({
  key: "filterBooleanFieldNone",
  get: (path) => ({ get }) => getFilter(get, path).none,
  set: (path) => ({ get, set }, value) =>
    setFilter(get, set, path, "none", value),
});

export const fieldIsFiltered = selectorFamily<boolean, string>({
  key: "booleanFieldIsFiltered",
  get: (path) => ({ get }) =>
    !(get(noneAtom(path)) || get(trueAtom(path)) || get(falseAtom(path))),
});

const BooleanFieldFilter = ({ expanded, entry }) => {
  const [ref, props] = useExpand(expanded);

  return (
    <animated.div style={props}>
      <NamedBooleanFilter
        color={entry.color}
        trueAtom={trueAtom(entry.path)}
        falseAtom={falseAtom(entry.path)}
        noneAtom={noneAtom(entry.path)}
        ref={ref}
      />
    </animated.div>
  );
};

export default React.memo(BooleanFieldFilter);
