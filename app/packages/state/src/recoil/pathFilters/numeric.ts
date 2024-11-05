import type { GetRecoilValue, SetRecoilState } from "recoil";
import { DefaultValue, selectorFamily } from "recoil";
import * as fos from "../atoms";
import * as visibilityAtoms from "../attributeVisibility";
import * as filterAtoms from "../filters";
import * as pathData from "../pathData";
import type { Range } from "../utils";
import { isFilterDefault } from "./utils";
import { pathHasIndexes, queryPerformance } from "../queryPerformance";

export interface NumericFilter {
  range: Range;
  none: boolean;
  nan: boolean;
  ninf: boolean;
  inf: boolean;
  exclude: boolean;
  isMatching: boolean;
}

const getFilter = (
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
    isMatching: !get(isFilterDefault({ modal, path })),
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

const meetsBounds = (range: Range, bounds: Range) => {
  return range[0] === bounds[0] && range[1] === bounds[1];
};

const meetsDefault = (filter: NumericFilter, bounds: Range) => {
  const isDefaultRange =
    filter.range.every((r) => r === null) || meetsBounds(filter.range, bounds);
  return (
    isDefaultRange && filter.none && filter.nan && filter.inf && filter.ninf
  );
};

interface SetParams {
  get: GetRecoilValue;
  set: SetRecoilState;
  modal: boolean;
  path: string;
  key: string;
  value: boolean | Range | DefaultValue;
}

const setFilter = ({ get, set, modal, path, key, value }: SetParams) => {
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
  const bounds = get(boundsAtom({ modal, path }));
  const isDefault = meetsDefault(check, bounds);

  const rangeIsNull = !filter.range || filter.range.every((r) => r === null);

  if (rangeIsNull) {
    delete filter.range;
  }

  if (isDefault) {
    set(filterAtoms.filter({ modal, path }), null);
  } else {
    set(filterAtoms.filter({ modal, path }), filter);
  }
};

const setVisibility = ({ get, set, modal, path, key, value }: SetParams) => {
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
  const bounds = get(boundsAtom({ modal, path }));
  const isDefault = meetsDefault(check, bounds);

  const rangeIsNull =
    !visibility.range || visibility.range.every((r) => r === null);

  if (rangeIsNull) {
    delete visibility.range;
  }

  if (isDefault) {
    set(visibilityAtoms.visibility({ modal, path }), null);
  } else {
    set(visibilityAtoms.visibility({ modal, path }), visibility);
  }
};

export const boundsAtom = selectorFamily<
  Range,
  {
    modal: boolean;
    path: string;
  }
>({
  key: "numericFieldBounds",
  get:
    (params) =>
    ({ get }) => {
      if (get(queryPerformance)) {
        return get(pathData.lightningBounds(params.path));
      }

      const bounds = get(pathData.bounds({ ...params, extended: false }));
      return bounds ? bounds : [null, null];
    },
});

export const rangeAtom = selectorFamily<
  Range,
  {
    modal: boolean;
    path: string;
    withBounds?: boolean;
  }
>({
  key: "filterNumericFieldRange",
  get:
    ({ modal, path, withBounds }) =>
    ({ get }) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      const range = isFilterMode
        ? getFilter(get, modal, path).range
        : getVisibility(get, modal, path).range;
      if (!withBounds || range.some((r) => r !== null)) {
        return range;
      }

      return get(boundsAtom({ modal, path }));
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, range) => {
      const params = { get, set, modal, path, key: "range", value: range };
      if (get(fos.isSidebarFilterMode)) {
        setFilter(params);
      } else {
        setVisibility(params);
      }
    },
});

export const minAtom = selectorFamily<
  number | null,
  {
    modal: boolean;
    path: string;
    withBounds?: boolean;
  }
>({
  key: "filterNumericFieldMin",
  get:
    (params) =>
    ({ get }) =>
      get(rangeAtom({ ...params }))[0],

  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      const range: Range = [
        value instanceof DefaultValue ? null : value,
        get(maxAtom({ modal, path })),
      ];
      const params = { get, set, modal, path, key: "range", value: range };
      if (get(fos.isSidebarFilterMode)) {
        setFilter(params);
      } else {
        setVisibility(params);
      }
    },
});

export const maxAtom = selectorFamily<
  number | null,
  {
    modal: boolean;
    path: string;
    withBounds?: boolean;
  }
>({
  key: "filterNumericFieldMax",
  get:
    (params) =>
    ({ get }) =>
      get(rangeAtom({ ...params }))[1],

  set:
    ({ modal, path }) =>
    ({ get, set }, value) => {
      const range: Range = [
        get(minAtom({ modal, path })),
        value instanceof DefaultValue ? null : value,
      ];
      const params = { get, set, modal, path, key: "range", value: range };
      if (get(fos.isSidebarFilterMode)) {
        setFilter(params);
      } else {
        setVisibility(params);
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
        setFilter({ get, set, modal, path, key, value });
      } else {
        setVisibility({ get, set, modal, path, key, value });
      }
    },
});

export const numericExcludeAtom = selectorFamily<
  boolean,
  {
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
    ({ modal, path }) =>
    ({ get, set }, value) => {
      const isFilterMode = get(fos.isSidebarFilterMode);
      if (isFilterMode) {
        setFilter({ get, set, modal, path, key: "exclude", value });
      } else {
        setVisibility({ get, set, modal, path, key: "exclude", value });
      }
    },
});

export const numericIsMatchingAtom = selectorFamily<
  boolean,
  {
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
    ({ modal, path }) =>
    ({ get, set }, value) => {
      setFilter({ get, set, modal, path, key: "isMatching", value });
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
    { modal: boolean; path: string }
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
          const startVisibility = visibility["range"][0];
          const endVisibility = visibility["range"][1];
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
          const startFilter = filter["range"][0];
          const endFilter = filter["range"][1];
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
          const startFilter = filter["range"][0];
          const endFilter = filter["range"][1];
          const noneFilter = filter["none"];
          const infFilter = filter["inf"];
          const ninfFilter = filter["ninf"];
          const nanFilter = filter["nan"];

          const excludeVisibility = visibility.exclude;
          const startVisibility = visibility["range"][0];
          const endVisibility = visibility["range"][1];
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

        return () => true;
      },
  });

export const numeric = generateSelectorFamily("numericFilter");
export const listNumber = generateSelectorFamily("listFieldNumericFilter");
