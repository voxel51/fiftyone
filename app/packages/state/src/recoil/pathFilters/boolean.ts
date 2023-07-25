import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import * as fos from "../atoms";
import * as visibilityAtoms from "../attributeVisibility";
import * as filterAtoms from "../filters";
import * as schemaAtoms from "../schema";

export interface BooleanFilter {
  false: boolean;
  true: boolean;
  none: boolean;
  isMatching: boolean;
  exclude: boolean;
}

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): BooleanFilter => {
  // nested listfield, label tag and modal use "isMatching: false" default
  const fieldPath = path.split(".").slice(0, -1).join(".");
  const fieldSchema = get(schemaAtoms.field(fieldPath));
  const isNestedfield = fieldSchema?.ftype.includes("ListField");
  const defaultToFilterMode = isNestedfield || modal || path === "_label_tags";
  return {
    true: false,
    false: false,
    none: false,
    isMatching: defaultToFilterMode ? false : true,
    exclude: false,
    ...get(filterAtoms.filter({ modal, path })),
  };
};

// getVisibility is similar to getFilter, it uses the visibilityAtoms
const getVisibility = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): BooleanFilter => {
  return {
    true: false,
    false: false,
    none: false,
    onlyMatch: true,
    isMatching: false,
    exclude: false,
    ...get(visibilityAtoms.visibility({ modal, path })),
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

const setVisibility = (
  get: GetRecoilValue,
  set: SetRecoilState,
  modal: boolean,
  path: string,
  key: string,
  value: boolean | DefaultValue
) => {
  const visibility = {
    exclude: false,
    ...getVisibility(get, modal, path),
    [key]: value,
  };
  if (meetsDefault(visibility)) {
    set(visibilityAtoms.visibility({ modal, path }), null);
  } else {
    set(visibilityAtoms.visibility({ modal, path }), visibility);
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
      const isFiltering = get(fos.isSidebarFilterMode);
      return isFiltering
        ? getFilter(get, modal, path).exclude
        : getVisibility(get, modal, path).exclude;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      const isFiltering = get(fos.isSidebarFilterMode);
      isFiltering
        ? setFilter(get, set, modal, path, "exclude", value)
        : setVisibility(get, set, modal, path, "exclude", value);
    },
});

export const trueAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string; isFiltering: boolean }
>({
  key: "filterBooleanFieldTrue",
  get:
    ({ modal, path, isFiltering }) =>
    ({ get }) => {
      return isFiltering
        ? getFilter(get, modal, path).true
        : getVisibility(get, modal, path).true;
    },
  set:
    ({ modal, path, isFiltering }) =>
    ({ get, set }, value) => {
      isFiltering
        ? setFilter(get, set, modal, path, "true", value)
        : setVisibility(get, set, modal, path, "true", value);
    },
});

export const falseAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string; isFiltering: boolean }
>({
  key: "filterBooleanFieldFalse",
  get:
    ({ modal, path, isFiltering }) =>
    ({ get }) => {
      return isFiltering
        ? getFilter(get, modal, path).false
        : getVisibility(get, modal, path).false;
    },
  set:
    ({ modal, path, isFiltering }) =>
    ({ get, set }, value) => {
      isFiltering
        ? setFilter(get, set, modal, path, "false", value)
        : setVisibility(get, set, modal, path, "false", value);
    },
});

export const noneAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string; isFiltering: boolean }
>({
  key: "filterBooleanFieldNone",
  get:
    ({ modal, path, isFiltering }) =>
    ({ get }) => {
      return isFiltering
        ? getFilter(get, modal, path).none
        : getVisibility(get, modal, path).none;
    },
  set:
    ({ modal, path, isFiltering }) =>
    ({ get, set }, value) => {
      isFiltering
        ? setFilter(get, set, modal, path, "none", value)
        : setVisibility(get, set, modal, path, "none", value);
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
      const isFiltering = get(fos.isSidebarFilterMode);
      if (get(noneAtom({ modal, path, isFiltering }))) {
        values.push(null);
      }

      if (get(falseAtom({ modal, path, isFiltering }))) {
        values.push(false);
      }

      if (get(trueAtom({ modal, path, isFiltering }))) {
        values.push(true);
      }

      return values;
    },
  set:
    ({ path, modal }) =>
    ({ get, set }, values) => {
      const isFiltering = get(fos.isSidebarFilterMode);
      const noneA = noneAtom({ path, modal, isFiltering });
      const falseA = falseAtom({ path, modal, isFiltering });
      const trueA = trueAtom({ modal, path, isFiltering });

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
const NONE = new Set<boolean | null | undefined>([undefined, null]);

const helperFunction = (
  value: boolean | null,
  trueValue,
  falseValue,
  noneValue,
  isVisibility
) => {
  const values = [];
  if (trueValue) {
    values.push(true);
  }
  if (falseValue) {
    values.push(false);
  }

  const r = isVisibility
    ? values.some((v) => v == value)
    : values.every((v) => v == value) ||
      (noneValue && NONE.has(value) && Boolean(value));

  return r;
};

export const generateBooleanSelectorFamily = (key) =>
  selectorFamily<
    (value: boolean | null) => boolean,
    { modal: boolean; path: string }
  >({
    key,
    get:
      (params) =>
      ({ get }) => {
        const filter = get(filterAtoms.filter(params));
        const visibility = get(visibilityAtoms.visibility(params));

        const trueValueFilter = get(trueAtom({ ...params, isFiltering: true }));
        const falseValueFilter = get(
          falseAtom({ ...params, isFiltering: true })
        );
        const noneValueFilter = get(noneAtom({ ...params, isFiltering: true }));
        const isMatching = get(boolIsMatchingAtom(params));
        const trueValueVisibility = get(
          trueAtom({ ...params, isFiltering: false })
        );
        const falseValueVisibility = get(
          falseAtom({ ...params, isFiltering: false })
        );
        const noneValueVisibility = get(
          noneAtom({ ...params, isFiltering: false })
        );

        // if there is no filter and no visibility, return true
        if (!filter && !visibility) {
          return () => true;
        }

        // if there is no filter but there is visibility
        if (!filter && visibility) {
          return (value) => {
            return helperFunction(
              value,
              trueValueVisibility,
              falseValueVisibility,
              noneValueVisibility,
              true
            );
          };
        }

        // if there is a filter but no visibility
        if (filter && !visibility) {
          return (value) => {
            if (isMatching) {
              return true;
            }
            return helperFunction(
              value,
              trueValueFilter,
              falseValueFilter,
              noneValueFilter,
              false
            );
          };
        }

        // if there is a filter and a visibility
        if (filter && visibility) {
          return (value) => {
            const filterResult = helperFunction(
              value,
              trueValueFilter,
              falseValueFilter,
              noneValueFilter,
              false
            );
            const visibilityResult = helperFunction(
              value,
              trueValueVisibility,
              falseValueVisibility,
              noneValueVisibility,
              true
            );

            if (isMatching) {
              return visibilityResult;
            }
            return filterResult && visibilityResult;
          };
        }

        return () => true;
      },
  });

export const boolean = generateBooleanSelectorFamily("booleanFilter");
export const listBoolean = generateBooleanSelectorFamily(
  "listFieldBooleanFilter"
);
