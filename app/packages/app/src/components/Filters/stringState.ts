import {
  atom,
  atomFamily,
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

import * as filterAtoms from "../../recoil/filters";
import * as selectors from "../../recoil/selectors";
import {
  OBJECT_ID_FIELD,
  STRING_FIELD,
  VALID_LIST_FIELDS,
} from "../../utils/labels";
import { filterStage, FilterParams } from "./atoms";

export const LIST_LIMIT = 200;

interface StringFilter {
  values: string[];
  exclude: boolean;
  _CLS: "str";
}

export const isStringField = selectorFamily<boolean, string>({
  key: "isStringField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    if (VALID_LIST_FIELDS.includes(map[name])) {
      map = get(selectors.primitivesSubfieldMap("sample"));
    }

    return [OBJECT_ID_FIELD, STRING_FIELD].includes(map[name]);
  },
});

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

  set(filterStage({ modal, path }), filter);
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
