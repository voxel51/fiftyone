import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import * as aggregationAtoms from "../aggregations";
import * as fos from "../atoms";
import * as visibilityAtoms from "../attributeVisibility";
import * as filterAtoms from "../filters";
import * as schemaAtoms from "../schema";

export interface NumericFilter {
  range: Range;
  none: boolean;
  nan: boolean;
  ninf: boolean;
  inf: boolean;
  exclude: boolean;
  isMatching: boolean;
}
export type Range = [number | null | undefined, number | null | undefined];

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): NumericFilter => {
  // nested listfield, label tag and modal use "isMatching: false" default
  const fieldPath = path.split(".").slice(0, -1).join(".");
  const fieldSchema = get(schemaAtoms.field(fieldPath));
  const isNestedfield = fieldSchema?.ftype.includes("ListField");
  const defaultToFilterMode = isNestedfield || modal || path === "_label_tags";

  const result = {
    range: [null, null] as Range,
    none: true,
    nan: true,
    inf: true,
    ninf: true,
    exclude: false,
    isMatching: defaultToFilterMode ? false : true,
    ...get(modal ? filterAtoms.modalFilters : filterAtoms.filters)[path],
  };

  return result;
};

const getVisibility = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): NumericFilter => {
  const result = {
    range: [null, null] as Range,
    none: true,
    nan: true,
    inf: true,
    ninf: true,
    exclude: false,
    isMatching: null,
    ...get(visibilityAtoms.visibility({ modal, path })),
  };

  return result;
};

const meetsDefault = (filter: NumericFilter) => {
  return (
    filter.range.every((r) => r === null) &&
    filter.none &&
    filter.nan &&
    filter.inf &&
    filter.ninf
  );
};

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  modal: boolean,
  path: string,
  key: string,
  value: boolean | Range | DefaultValue
) => {
  const filter = {
    isMatching: true,
    exclude: false,
    range: [null, null] as Range,
    ...getFilter(get, modal, path),
    [key]: value,
  };

  const check = {
    ...filter,
    [key]: value,
  };

  const isDefault = meetsDefault(check);

  if (filter.range[0] === null && filter.range[1] === null) {
    filter.exclude = false;
    filter.isMatching = true;
  }

  const bounds = get(boundsAtom({ path }));
  const rangeIsNull = !filter.range || filter.range.every((r) => r === null);

  if (!isDefault && rangeIsNull) {
    set(filterAtoms.filter({ modal, path }), { ...filter, range: bounds });
  } else if (isDefault) {
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
  value: boolean | Range | DefaultValue
) => {
  const visibility = {
    isMatching: true,
    exclude: false,
    range: [null, null] as Range,
    ...getFilter(get, modal, path),
    [key]: value,
  };

  const check = {
    ...visibility,
    [key]: value,
  };

  const isDefault = meetsDefault(check);

  if (visibility.range[0] === null && visibility.range[1] === null) {
    visibility.exclude = false;
    visibility.isMatching = true;
  }

  const bounds = get(boundsAtom({ path }));
  const rangeIsNull =
    !visibility.range || visibility.range.every((r) => r === null);

  if (!isDefault && rangeIsNull) {
    set(visibilityAtoms.visibility({ modal, path }), {
      ...visibility,
      range: bounds,
    });
  } else if (isDefault) {
    set(visibilityAtoms.visibility({ modal, path }), null);
  } else {
    set(visibilityAtoms.visibility({ modal, path }), visibility);
  }
};

export const boundsAtom = selectorFamily<
  Range,
  {
    path: string;
    defaultRange?: Range;
  }
>({
  key: "numericFieldBounds",
  get:
    ({ path, defaultRange }) =>
    ({ get }) => {
      let bounds = get(
        aggregationAtoms.bounds({ path, extended: false, modal: false })
      ) as Range;

      if (!bounds) {
        return [null, null];
      }

      if (bounds.every((b) => b === null)) {
        return bounds;
      }

      let [maxMin, minMax]: Range = [null, null];
      if (defaultRange) {
        [maxMin, minMax] = defaultRange;
        bounds = [
          maxMin < bounds[0] ? maxMin : bounds[0],
          minMax > bounds[1] ? minMax : bounds[1],
        ];
      }
      return [bounds[0], bounds[1]];
    },
});

export const rangeAtom = selectorFamily<
  Range,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
    withBounds?: boolean;
  }
>({
  key: "filterNumericFieldRange",
  get:
    ({ modal, path, defaultRange, withBounds }) =>
    ({ get }) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      const range = isFilterMode
        ? getFilter(get, modal, path).range
        : getVisibility(get, modal, path).range;
      if (withBounds && range.every((r) => r === null)) {
        return get(boundsAtom({ path, defaultRange }));
      }

      return range;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, range) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      if (isFilterMode) {
        setFilter(get, set, modal, path, "range", range);
      } else {
        setVisibility(get, set, modal, path, "range", range);
      }
    },
});

export const nonfiniteAtom = selectorFamily<
  boolean,
  {
    modal: boolean;
    path: string;
    key: "nan" | "none" | "inf" | "ninf";
  }
>({
  key: "nonfiniteAtom",
  get:
    ({ modal, path, key }) =>
    ({ get }) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      return isFilterMode
        ? getFilter(get, modal, path)[key]
        : getVisibility(get, modal, path)[key];
    },
  set:
    ({ modal, path, key }) =>
    ({ get, set }, value) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      if (isFilterMode) {
        setFilter(get, set, modal, path, key, value);
      } else {
        setVisibility(get, set, modal, path, key, value);
      }
    },
});

export const numericExcludeAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
  }
>({
  key: "filterNumericFieldExclude",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      return isFilterMode
        ? getFilter(get, modal, path).exclude
        : getVisibility(get, modal, path).exclude;
    },
  set:
    ({ modal, path, defaultRange }) =>
    ({ get, set }, value) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      if (isFilterMode) {
        setFilter(get, set, modal, path, "exclude", value);
      } else {
        setVisibility(get, set, modal, path, "exclude", value);
      }
    },
});

export const numericIsMatchingAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
  }
>({
  key: "numericFilterIsMatching",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return getFilter(get, modal, path).isMatching;
    },
  set:
    ({ modal, path, defaultRange }) =>
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "isMatching", value);
    },
});

type DatetimeValue = {
  datetime: number;
  _cls: "DateTime";
};

const helperFunction = (
  value: DatetimeValue | number | string | null,
  exclude: boolean,
  start: number,
  end: number,
  none: boolean,
  inf: boolean,
  ninf: boolean,
  nan: boolean
) => {
  const noRange = start === null || end === null;

  if (nan && value === "nan") {
    return !exclude;
  }

  if (inf && value === "inf") {
    return !exclude;
  }

  if (ninf && value === "-inf") {
    return !exclude;
  }

  if ((value === null || value === undefined) && none) {
    return !exclude;
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    Number(value?.datetime)
  ) {
    const time = value.datetime;
    return noRange
      ? true
      : exclude
      ? Number(time) < start || Number(time) > end
      : Number(time) >= start && Number(time) <= end;
  }

  if (typeof Number(value) === "number") {
    return noRange
      ? true
      : exclude
      ? Number(value) < start || Number(value) > end
      : Number(value) >= start && Number(value) <= end;
  }

  return false;
};

// this is where the final filtering for looker occurs in the App
// it returns a boolean about whether labels are selected or not
export const generateSelectorFamily = (key) =>
  selectorFamily<
    (value: number | null) => boolean,
    { modal: boolean; path: string; defaultRange?: Range }
  >({
    key: key,
    get:
      (params) =>
      ({ get }) => {
        const filter = get(filterAtoms.filter(params));
        const visibility = get(visibilityAtoms.visibility(params));

        // if no filter and no visibility, return true
        if (!filter && !visibility) {
          return () => true;
        }

        // if there is visibility and no filter
        if (!filter && visibility) {
          const excludeVisibility = visibility.exclude;
          const startVisibility = visibility.range[0];
          const endVisibility = visibility.range[1];
          const noneVisibility = visibility["none"];
          const infVisibility = visibility["inf"];
          const ninfVisibility = visibility["ninf"];
          const nanVisibility = visibility["nan"];

          return (value) => {
            return helperFunction(
              value,
              excludeVisibility,
              startVisibility,
              endVisibility,
              noneVisibility,
              infVisibility,
              ninfVisibility,
              nanVisibility
            );
          };
        }

        // if there is filter and no visibility
        if (filter && !visibility) {
          const excludeFilter = filter.exclude;
          const isMatchingFilter = filter.isMatching;
          const startFilter = filter.range[0];
          const endFilter = filter.range[1];
          const noneFilter = filter["none"];
          const infFilter = filter["inf"];
          const ninfFilter = filter["ninf"];
          const nanFilter = filter["nan"];

          return (value) => {
            if (isMatchingFilter) {
              return true;
            }

            return helperFunction(
              value,
              excludeFilter,
              startFilter,
              endFilter,
              noneFilter,
              infFilter,
              ninfFilter,
              nanFilter
            );
          };
        }

        // if there is filter and visibility
        if (filter && visibility) {
          const excludeFilter = filter.exclude;
          const isMatchingFilter = filter.isMatching;
          const startFilter = filter.range[0];
          const endFilter = filter.range[1];
          const noneFilter = filter["none"];
          const infFilter = filter["inf"];
          const ninfFilter = filter["ninf"];
          const nanFilter = filter["nan"];

          const excludeVisibility = visibility.exclude;
          const startVisibility = visibility.range[0];
          const endVisibility = visibility.range[1];
          const noneVisibility = visibility["none"];
          const infVisibility = visibility["inf"];
          const ninfVisibility = visibility["ninf"];
          const nanVisibility = visibility["nan"];

          return (value) => {
            const visibilityResult = helperFunction(
              value,
              excludeVisibility,
              startVisibility,
              endVisibility,
              noneVisibility,
              infVisibility,
              ninfVisibility,
              nanVisibility
            );

            if (isMatchingFilter) {
              return visibilityResult;
            }
            const filterResult = helperFunction(
              value,
              excludeFilter,
              startFilter,
              endFilter,
              noneFilter,
              infFilter,
              ninfFilter,
              nanFilter
            );
            return filterResult && visibilityResult;
          };
        }

        return () => true; // not needed but eslint complains
      },
  });

export const numeric = generateSelectorFamily("numericFilter");
export const listNumber = generateSelectorFamily("listFieldNumericFilter");
