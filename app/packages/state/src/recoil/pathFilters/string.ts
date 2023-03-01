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
  onlyMatch: boolean;
  isMatching: boolean; // match_labels vs filter_labels mode
}

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): StringFilter => {
  return {
    values: [],
    exclude: false,
    isMatching: false,
    onlyMatch: true,
    _CLS: "str",
    ...get(filterAtoms.filter({ modal, path })),
  } as StringFilter;
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
    filter.isMatching = false;
    filter.onlyMatch = true;
  }

  if (meetsDefault(filter)) {
    filter = null;
  }

  set(filterAtoms.filter({ modal, path }), filter);
};

// updates the string values in the filter
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

// updates if the filter is excluding or not
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
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "exclude", value);
    },
});

// updates if the filter should use onlyMatch (omit empty samples)
export const onlyMatchAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "onlyMatch",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).onlyMatch,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "onlyMatch", value),
});

// updates if it is filter or match model
export const isMatchingAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "isMatching",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).isMatching,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "isMatching", value),
});

const NONE = new Set<string | null | undefined>([undefined, null]);

// this is where the final filtering for looker occurs in the App
// it returns a boolean about whether labels are selected or not
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
      const isMatching = get(isMatchingAtom(params));
      if (isMatching) {
        return (value) => true;
      }

      const exclude = get(stringExcludeAtom(params));
      const values = get(stringSelectedValuesAtom({ ...params }));
      const none = values.includes(null);

      return (value) => {
        const r = values.includes(value) || (none && NONE.has(value));
        return exclude ? !r : r;
      };
    },
});

export const listString = selectorFamily<
(value: string | null) => boolean,
{ modal: boolean; path: string }
>({
key: "stringFilterForListField",
get:
  (params) =>
  ({ get }) => {
    if (!get(filterAtoms.filter(params))) {
      return (value) => true;
    }
    const isMatching = get(isMatchingAtom(params));
    if (isMatching) {
      return (value) => true;
    }

    const exclude = get(stringExcludeAtom(params));
    const values = get(stringSelectedValuesAtom({ ...params }));
    const none = values.includes(null);

    return (value) => {
      const c1 = values.every(v => value?.includes(v));
      const c2 = (none && NONE.has(value));
      const c3 = value;
      const r = (c1 || c2) && c3;
      return exclude ? !r : r;
    };
  },
});