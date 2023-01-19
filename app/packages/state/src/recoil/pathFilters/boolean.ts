import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import * as filterAtoms from "../filters";

interface BooleanFilter {
  false: boolean;
  true: boolean;
  none: boolean;
  onlyMatch: boolean;
  isMatching: boolean;
  exclude: boolean;
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
    onlyMatch: true,
    isMatching: false,
    exclude: false,
    ...get(filterAtoms.filter({ modal, path })),
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
    onlyMatch: true,
    isMatching: false,
    exclude: false,
    ...getFilter(get, modal, path),
    [key]: value,
  };
  if (meetsDefault(filter)) {
    set(filterAtoms.filter({ modal, path }), null);
  } else {
    set(filterAtoms.filter({ modal, path }), filter);
  }
};

export const boolIsMatchingAtom = selectorFamily<
  boolean,
  {
    modal: boolean;
    path: string;
  }
>({
  key: "boolIsMatching",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return getFilter(get, modal, path).isMatching;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "isMatching", value);
    },
});

export const boolOnlyMatchAtom = selectorFamily<
  boolean,
  {
    modal: boolean;
    path: string;
  }
>({
  key: "boolOnlyMatch",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return getFilter(get, modal, path).onlyMatch;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "onlyMatch", value);
    },
});

export const boolExcludeAtom = selectorFamily<
  boolean,
  {
    modal: boolean;
    path: string;
  }
>({
  key: "boolExclude",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return getFilter(get, modal, path).exclude;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "exclude", value);
    },
});

export const trueAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "filterBooleanFieldTrue",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).true,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "true", value),
});

export const falseAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "filterBooleanFieldFalse",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).false,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "false", value),
});

export const noneAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "filterBooleanFieldNone",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      getFilter(get, modal, path).none,
  set:
    ({ modal, path }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, "none", value),
});

export const booleanFieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "booleanFieldIsFiltered",
  get:
    ({ path, modal }) =>
    ({ get }) => {
      return (
        get(noneAtom({ path, modal })) ||
        get(trueAtom({ path, modal })) ||
        get(falseAtom({ path, modal }))
      );
    },
});

export const booleanSelectedValuesAtom = selectorFamily<
  (null | boolean)[],
  { modal: boolean; path: string }
>({
  key: "booleanSelectedValues",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      const values: (null | boolean)[] = [];

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
  set:
    ({ path, modal }) =>
    ({ get, set }, values) => {
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

// this is where the final filtering for looker occurs in the App
// it returns a boolean about whether labels are selected or not

export const boolean = selectorFamily<
  (value: boolean | null) => boolean,
  { modal: boolean; path: string }
>({
  key: "booleanFilter",
  get:
    (params) =>
    ({ get }) => {
      if (!get(filterAtoms.filter(params))) {
        return () => true;
      }

      const trueValue = get(trueAtom(params));
      const falseValue = get(falseAtom(params));
      const noneValue = get(noneAtom(params));
      const isMatching = get(boolIsMatchingAtom(params));

      return (value) => {
        if (isMatching) {
          return true;
        }
        if (value === true && trueValue) {
          return true;
        }

        if (value === false && falseValue) {
          return true;
        }

        if ((value === null || value === undefined) && noneValue) {
          return true;
        }

        return false;
      };
    },
});
