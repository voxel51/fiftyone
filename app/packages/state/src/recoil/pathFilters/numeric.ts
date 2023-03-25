import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";
import * as aggregationAtoms from "../aggregations";
import * as filterAtoms from "../filters";

export interface NumericFilter {
  range: Range;
  none: boolean;
  nan: boolean;
  ninf: boolean;
  inf: boolean;
  exclude: boolean;
  isMatching: boolean;
  onlyMatch: boolean;
  _CLS: string;
}
export type Range = [number | null | undefined, number | null | undefined];

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string
): NumericFilter => {
  const result = {
    _CLS: "numeric",
    range: [null, null] as Range,
    none: true,
    nan: true,
    inf: true,
    ninf: true,
    exclude: false,
    isMatching: true,
    onlyMatch: true,
    ...get(modal ? filterAtoms.modalFilters : filterAtoms.filters)[path],
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
    _CLS: "numeric",
    onlyMatch: true,
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
    filter.onlyMatch = true;
  }

  const bounds = get(boundsAtom({ path }));
  const rangeIsNull =
    !Boolean(filter.range) || filter.range.every((r) => r === null);

  if (!isDefault && rangeIsNull) {
    set(filterAtoms.filter({ modal, path }), { ...filter, range: bounds });
  } else if (isDefault) {
    set(filterAtoms.filter({ modal, path }), null);
  } else {
    set(filterAtoms.filter({ modal, path }), filter);
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
      const range = getFilter(get, modal, path).range;
      if (withBounds && range.every((r) => r === null)) {
        return get(boundsAtom({ path, defaultRange }));
      }

      return range;
    },
  set:
    ({ modal, path }) =>
    ({ get, set }, range) => {
      setFilter(get, set, modal, path, "range", range);
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
    ({ get }) =>
      getFilter(get, modal, path)[key],
  set:
    ({ modal, path, key }) =>
    ({ get, set }, value) =>
      setFilter(get, set, modal, path, key, value),
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
      return getFilter(get, modal, path).exclude;
    },
  set:
    ({ modal, path, defaultRange }) =>
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "exclude", value);
    },
});

export const numericOnlyMatchAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
  }
>({
  key: "numericFilterOnlyMatch",
  get:
    ({ modal, path }) =>
    ({ get }) => {
      return getFilter(get, modal, path).onlyMatch;
    },
  set:
    ({ modal, path, defaultRange }) =>
    ({ get, set }, value) => {
      setFilter(get, set, modal, path, "onlyMatch", value);
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

export const numericFieldIsFiltered = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal?: boolean;
    path: string;
  }
>({
  key: "numericFieldIsFiltered",
  get:
    ({ path, modal }) =>
    ({ get }) =>
      !meetsDefault(getFilter(get, Boolean(modal), path)),
});

// this is where the final filtering for looker occurs in the App
// it returns a boolean about whether labels are selected or not
export const numeric = selectorFamily<
  (value: number | null) => boolean,
  { modal: boolean; path: string; defaultRange?: Range }
>({
  key: "numericFilter",
  get:
    (params) =>
    ({ get }) => {
      const exclude = get(numericExcludeAtom(params));
      const isMatching = get(numericIsMatchingAtom(params));

      if (isMatching) {
        return (value) => true;
      }

      const [start, end] = get(rangeAtom(params));
      const none = get(nonfiniteAtom({ ...params, key: "none" }));
      const inf = get(nonfiniteAtom({ ...params, key: "inf" }));
      const ninf = get(nonfiniteAtom({ ...params, key: "ninf" }));
      const nan = get(nonfiniteAtom({ ...params, key: "ninf" }));
      const noRange = start === null || end === null;

      return (value) => {
        if (typeof value === "number") {
          return noRange
            ? true
            : exclude
            ? value < start || value > end
            : value >= start && value <= end;
        }

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

        return false;
      };
    },
});
