import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

import * as selectors from "../../recoil/selectors";
import { BOOLEAN_FIELD, VALID_LIST_FIELDS } from "../../utils/labels";
import { Value } from "./types";
import { filterStage, FilterParams } from "./atoms";

interface BooleanFilter {
  false: boolean;
  true: boolean;
  none: boolean;
  _CLS: "bool";
}

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): BooleanFilter => {
  return {
    _CLS: "bool",
    true: false,
    false: false,
    none: false,
    ...get(filterStage({ modal, path })),
  };
};

const meetsDefault = (filter: BooleanFilter) =>
  filter.true === false && filter.false === false && filter.none === false;

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  modal: boolean,
  path: string,
  key: string,
  value: boolean | DefaultValue
) => {
  const filter = {
    ...getFilter(get, modal, path),
    [key]: value,
  };
  if (meetsDefault(filter)) {
    set(filterStage({ modal, path }), null);
  } else {
    set(filterStage({ modal, path }), filter);
  }
};

export const trueAtom = selectorFamily<boolean, FilterParams>({
  key: "filterBooleanFieldTrue",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).true,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "true", value),
});

export const falseAtom = selectorFamily<boolean, FilterParams>({
  key: "filterBooleanFieldFalse",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).false,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "false", value),
});

export const noneAtom = selectorFamily<boolean, FilterParams>({
  key: "filterBooleanFieldNone",
  get: ({ modal, path }) => ({ get }) => getFilter(get, modal, path).none,
  set: ({ modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "none", value),
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "booleanFieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    return (
      get(noneAtom({ path, modal })) ||
      get(trueAtom({ path, modal })) ||
      get(falseAtom({ path, modal }))
    );
  },
});

export const selectedValuesAtom = selectorFamily<
  Value[],
  { modal: boolean; path: string }
>({
  key: "booleanSelectedValues",
  get: ({ modal, path }) => ({ get }) => {
    const values: Value[] = [];

    if (get(noneAtom({ modal, path }))) {
      values.push(null);
    }

    if (get(falseAtom({ modal, path }))) {
      values.push(false);
    }

    if (get(trueAtom({ modal, path }))) {
      values.push(true);
    }

    return values;
  },
  set: ({ path, modal }) => ({ get, set }, values) => {
    const noneA = noneAtom({ path, modal });
    const falseA = falseAtom({ path, modal });
    const trueA = trueAtom({ modal, path });

    const currentNone = get(noneA);
    const currentFalse = get(falseA);
    const currentTrue = get(trueA);

    if (!Array.isArray(values)) {
      currentNone && set(noneA, false);
      currentFalse && set(falseA, false);
      currentTrue && set(trueA, false);
      return;
    }

    const newNone = values.includes(null);
    if (newNone !== currentNone) {
      set(noneA, newNone);
    }

    const newFalse = values.includes(false);
    if (newFalse !== currentFalse) {
      set(falseA, newFalse);
    }

    const newTrue = values.includes(true);
    if (newTrue !== currentTrue) {
      set(trueA, newTrue);
    }
  },
});

export const isBooleanField = selectorFamily<boolean, string>({
  key: "isBooleanField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    if (VALID_LIST_FIELDS.includes(map[name])) {
      map = get(selectors.primitivesSubfieldMap("sample"));
    }

    return map[name] === BOOLEAN_FIELD;
  },
});
