import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

import * as filterAtoms from "../../recoil/filters";
import { StringFilter } from "./utils";

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
  let filter = {
    ...getFilter(get, modal, path),
    [key]: value,
  };
  if (filter.values.length === 0) {
    filter.exclude = false;
  }

  if (meetsDefault(filter)) {
    filter = null;
  }

  set(filterAtoms.filter({ modal, path }), filter);
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

const NONE = new Set([undefined, null]);

export const filter = selectorFamily<
  (value: string | null) => boolean,
  { modal: boolean; path: string }
>({
  key: "stringFilter",
  get: (params) => ({ get }) => {
    if (!get(filterAtoms.filter(params))) {
      return (value) => true;
    }
    const exclude = get(excludeAtom(params));
    const values = get(selectedValuesAtom(params));
    const none = values.includes(null);

    return (value) => {
      const result = values.includes(value) || (none && NONE.has(value));
      return exclude ? !result : result;
    };
  },
});
