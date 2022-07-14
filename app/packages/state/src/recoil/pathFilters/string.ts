import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import * as filterAtoms from "../filters";

export interface StringFilter {
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
  value: boolean | (string | null)[] | DefaultValue
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

export const stringSelectedValuesAtom = selectorFamily<
  (string | null)[],
  { modal: boolean; path: string }
>({
  key: "stringSelectedValuesAtom",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).values,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "values", value),
});

export const stringExcludeAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "stringExclude",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).exclude,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "exclude", value),
});

const NONE = new Set<string | null | undefined>([undefined, null]);

export const string = selectorFamily<
  (value: string | null) => boolean,
  { modal: boolean; path: string }
>({
  key: "stringFilter",
  get:
    (params) =>
    ({ get }) => {
      if (!get(filterAtoms.filter(params))) {
        return (value) => true;
      }
      const exclude = get(stringExcludeAtom(params));
      const values = get(stringSelectedValuesAtom(params));
      const none = values.includes(null);

      return (value) => {
        const result = values.includes(value) || (none && NONE.has(value));
        return exclude ? !result : result;
      };
    },
});
