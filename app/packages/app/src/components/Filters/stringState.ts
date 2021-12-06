import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

import * as filterAtoms from "../../recoil/filters";

interface StringFilter {
  values: string[];
  exclude: boolean;
  _CLS: "str";
}

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): StringFilter => {
  return {
    values: [],
    exclude: false,
    _CLS: "str",
    ...get(filterAtoms.filter({ modal, path })),
  };
};

const meetsDefault = (filter: StringFilter) =>
  filter.values.length === 0 && filter.exclude === false;

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  modal: boolean,
  path: string,
  key: string,
  value: boolean | string[] | DefaultValue
) => {
  const filter = {
    ...getFilter(get, modal, path),
    [key]: value,
  };
  if (filter.values.length === 0) {
    filter.exclude = false;
  }
  if (meetsDefault(filter)) {
    set(filterAtoms.filter({ modal, path }), null);
  } else {
    set(filterAtoms.filter({ modal, path }), filter);
  }
};

export const selectedValuesAtom = selectorFamily<
  string[],
  { modal: boolean; path: string }
>({
  key: "filterStringFieldValues",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).values,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "values", value),
});

export const excludeAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "filterStringFieldExclude",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).exclude,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "exclude", value),
});
