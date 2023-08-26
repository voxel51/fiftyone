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

export interface StringFilter {
  values: string[];
  exclude: boolean;
  isMatching: boolean; // match_labels vs filter_labels mode
}

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): StringFilter => {
  // nested listfield, label tag and modal use "isMatching: false" default
  const fieldPath = path.split(".").slice(0, -1).join(".");
  const fieldSchema = get(schemaAtoms.field(fieldPath));
  const isNestedfield = fieldSchema?.ftype.includes("ListField");
  const defaultToFilterMode = isNestedfield || modal || path === "_label_tags";

  return {
    values: [],
    exclude: false,
    isMatching: defaultToFilterMode ? false : true,
    ...get(filterAtoms.filter({ modal, path })),
  } as StringFilter;
};

const getVisibility = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): StringFilter => {
  return {
    values: [],
    exclude: false,
    ...get(visibilityAtoms.visibility({ modal, path })),
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
  }

  if (meetsDefault(filter)) {
    filter = null;
  }

  set(filterAtoms.filter({ modal, path }), filter);
};

const setVisibility = (
  get: GetRecoilValue,
  set: SetRecoilState,
  modal: boolean,
  path: string,
  key: string,
  value: boolean | (string | null)[] | DefaultValue
) => {
  let visibility = {
    ...getVisibility(get, modal, path),
    [key]: value,
  };

  if (visibility.values.length === 0) {
    visibility.exclude = false;
  }

  if (meetsDefault(visibility)) {
    visibility = null;
  }

  set(visibilityAtoms.visibility({ modal, path }), visibility);
};

// updates the string values in the filter
export const stringSelectedValuesAtom = selectorFamily<
  (string | null)[],
  { modal: boolean; path: string }
>({
  key: "stringSelectedValuesAtom",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      const isFiltering = get(fos.isSidebarFilterMode);
      return isFiltering
        ? getFilter(get, modal, path).values
        : getVisibility(get, modal, path).values;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      const isFiltering = get(fos.isSidebarFilterMode);
      return isFiltering
        ? setFilter(get, set, modal, path, "values", value)
        : setVisibility(get, set, modal, path, "values", value);
    },
});

// updates if the filter is excluding or not
export const stringExcludeAtom = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "stringExclude",
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
      return isFiltering
        ? setFilter(get, set, modal, path, "exclude", value)
        : setVisibility(get, set, modal, path, "exclude", value);
    },
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
      const filter = get(filterAtoms.filter(params));
      const visibility = get(visibilityAtoms.visibility(params));

      if (!filter && !visibility) {
        return () => true;
      }

      if (!filter && visibility) {
        return helperStringFunction(visibility);
      }

      if (filter && !visibility) {
        if (filter.isMatching) {
          return () => true;
        }
        return helperStringFunction(filter);
      }

      if (filter && visibility) {
        const visibilityFn = helperStringFunction(visibility);
        const filterFn = helperStringFunction(filter);
        if (filter.isMatching) {
          return (value: string | null) => {
            return visibilityFn(value);
          };
        }

        return (value: string | null) => {
          return filterFn(value) && visibilityFn(value);
        };
      }

      return () => true; // not needed, but eslint complains
    },
});

const helperStringFunction = (settings: {
  values: string[];
  exclude: boolean;
  isMatching?: boolean;
}) => {
  const { values, exclude } = settings;
  const none = values.includes(null);

  if (settings.isMatching) {
    return () => true;
  }

  return (value: string | null) => {
    const r = values.includes(value) || (none && NONE.has(value));
    return exclude ? !r : r;
  };
};

export const listString = selectorFamily<
  (value: string | null) => boolean,
  { modal: boolean; path: string }
>({
  key: "listFieldStringFilter",
  get:
    (params) =>
    ({ get }) => {
      // common properties
      const filter = get(filterAtoms.filter(params));
      const visibility = get(visibilityAtoms.visibility(params));

      // when there is no filter and no visibility settings, show the label
      if (!filter && !visibility) {
        return () => true;
      }

      // when there is no filter, but there is a visibility setting
      if (!filter && visibility) {
        const { values, exclude } = visibility;
        const none = values.includes(null);

        return (value) => {
          return handleValues(values, value, none, exclude, true);
        };
      }

      // when there is a filter setting, but no visibility setting
      if (filter && !visibility) {
        const { values, exclude, isMatching } = filter;
        const none = values.includes(null);

        if (isMatching) {
          return () => true;
        }
        return (value) => {
          return handleValues(values, value, none, exclude, false);
        };
      }

      // when there is a filter and a visibility setting
      if (filter && visibility) {
        const { values, exclude, isMatching } = filter;
        const none = values.includes(null);

        const visibilityValues = visibility.values;
        const visibilityExclude = visibility.exclude;
        const visibilityNone = visibilityValues.includes(null);

        if (isMatching) {
          return (value) => {
            return handleValues(
              visibilityValues,
              value,
              visibilityNone,
              visibilityExclude,
              true
            );
          };
        }

        return (value) => {
          const filterResult = handleValues(
            values,
            value,
            none,
            exclude,
            false
          );
          const visibilityResult = handleValues(
            visibilityValues,
            value,
            visibilityNone,
            visibilityExclude,
            true
          );

          return filterResult && visibilityResult;
        };
      }

      return () => true; // not needed, but eslint complains
    },
});

// helper function for list of string fields
const handleValues = (
  values: string[], // selected list value
  value: string | null, // current value of the tag
  none: unknown,
  exclude: boolean,
  isVisibility: boolean // filter and visibility has different logic for list values
) => {
  const r =
    (isVisibility
      ? values?.some((v) => value?.includes(v))
      : values?.every((v) => value?.includes(v)) ||
        (none && NONE.has(value))) && Boolean(value);
  return exclude ? !r : r;
};
