import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

import * as aggregationAtoms from "../../recoil/aggregations";
import * as filterAtoms from "../../recoil/filters";
import { Range } from "../Common/RangeSlider";
import { NumericFilter } from "./utils";

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string,
  defaultRange?: Range
): NumericFilter => {
  const bounds = get(boundsAtom({ path, defaultRange }));
  const result = {
    _CLS: "numeric",
    range: bounds,
    none: true,
    nan: true,
    inf: true,
    ninf: true,
    exclude: false,
    ...get(modal ? filterAtoms.modalFilters : filterAtoms.filters)[path],
  };

  return result;
};

const meetsDefault = (filter: NumericFilter, bounds: Range) => {
  return (
    filter.range.every((r, i) => r === bounds[i]) &&
    filter.none &&
    filter.nan &&
    filter.inf &&
    filter.ninf &&
    !filter.exclude
  );
};

const setFilter = (
  get: GetRecoilValue,
  set: SetRecoilState,
  modal: boolean,
  path: string,
  key: string,
  value: boolean | Range | DefaultValue,
  defaultRange: Range | null = null
) => {
  const bounds = get(boundsAtom({ path, defaultRange }));
  const filter = {
    range: bounds,
    ...getFilter(get, modal, path, defaultRange),
    [key]: value,
    _CLS: "numeric",
  };

  const check = {
    ...filter,
    [key]: value,
  };

  const isDefault = meetsDefault(check, bounds);
  if (!isDefault && meetsDefault({ ...check, range: bounds }, bounds)) {
    set(filterAtoms.filter({ modal, path }), {
      range: filter.range,
      _CLS: "numeric",
    });
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
  get: ({ path, defaultRange }) => ({ get }) => {
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
  }
>({
  key: "filterNumericFieldRange",
  get: ({ defaultRange, modal, path }) => ({ get }) => {
    return getFilter(get, modal, path, defaultRange).range;
  },
  set: ({ defaultRange, modal, path }) => ({ get, set }, range) => {
    setFilter(get, set, modal, path, "range", range, defaultRange);
  },
});

export const nonfiniteAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
    key: "nan" | "none" | "inf" | "ninf";
  }
>({
  key: "nonfiniteAtom",
  get: ({ defaultRange, modal, path, key }) => ({ get }) =>
    getFilter(get, modal, path, defaultRange)[key],
  set: ({ defaultRange, modal, path, key }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, key, value, defaultRange),
});

export const excludeAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
  }
>({
  key: "filterNumericFieldExclude",
  get: ({ modal, path, defaultRange }) => ({ get }) => {
    return getFilter(get, modal, path, defaultRange).exclude;
  },
  set: ({ modal, path, defaultRange }) => ({ get, set }, value) => {
    setFilter(get, set, modal, path, "exclude", value, defaultRange);
  },
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal?: boolean;
    path: string;
  }
>({
  key: "numericFieldIsFiltered",
  get: ({ path, defaultRange, modal }) => ({ get }) =>
    !meetsDefault(
      getFilter(get, modal, path, defaultRange),
      get(boundsAtom({ path, defaultRange }))
    ),
});

export const isDefaultRange = selectorFamily<
  boolean,
  { defaultRange?: Range; modal: boolean; path: string }
>({
  key: "isDefaultNumericFieldRange",
  get: (params) => ({ get }) => {
    const range = get(rangeAtom(params));
    return get(boundsAtom(params)).every((b, i) => b === range[i]);
  },
});

export const filter = selectorFamily<
  (value: number | null) => boolean,
  { modal: boolean; path: string; defaultRange?: Range }
>({
  key: "numericFilter",
  get: (params) => ({ get }) => {
    const exclude = get(excludeAtom(params));
    const [start, end] = get(rangeAtom(params));
    const none = get(nonfiniteAtom({ ...params, key: "none" }));
    const inf = get(nonfiniteAtom({ ...params, key: "inf" }));
    const ninf = get(nonfiniteAtom({ ...params, key: "ninf" }));
    const nan = get(nonfiniteAtom({ ...params, key: "ninf" }));

    return (value) => {
      if (typeof value === "number") {
        return exclude
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
