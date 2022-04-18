import {
  atom,
  atomFamily,
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

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

export const skeletonLabels = atomFamily<
  { [key: string]: StringFilter },
  boolean
>({
  key: "skeletonLabels",
  default: {},
});

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
  let f;
  if (path.endsWith(".points.label")) {
    f = get(skeletonLabels(modal));
    f = f[path] || {};
  } else {
    f = get(filterStage({ modal, path }));
  }

  return {
    values: [],
    exclude: false,
    _CLS: "str",
    ...f,
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
  if (path.endsWith(".points.label")) {
    set(skeletonLabels(modal), {
      ...get(skeletonLabels(modal)),
      [path]: filter,
    });
  } else {
    set(filterStage({ modal, path }), null);
  }
};

export const selectedValuesAtom = selectorFamily<string[], FilterParams>({
  key: "filterStringFieldValues",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).values,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "values", value),
});

export const excludeAtom = selectorFamily<boolean, FilterParams>({
  key: "filterStringFieldExclude",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).exclude,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "exclude", value),
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal?: boolean }
>({
  key: "stringFieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    return (
      get(selectedValuesAtom({ modal, path })).length > 0 ||
      excludeAtom({ modal, path })
    );
  },
});
