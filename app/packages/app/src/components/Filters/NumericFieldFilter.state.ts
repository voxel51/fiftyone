import {
  DefaultValue,
  GetRecoilValue,
  selectorFamily,
  SetRecoilState,
} from "recoil";

import * as selectors from "../../recoil/selectors";
import { Range } from "./RangeSlider";
import {
  AGGS,
  LIST_FIELD,
  FRAME_SUPPORT_FIELD,
  VALID_LIST_FIELDS,
  VALID_NUMERIC_TYPES,
  INT_FIELD,
  DATE_TIME_FIELD,
  DATE_FIELD,
  FLOAT_FIELD,
} from "../../utils/labels";
import {
  extendedModalStats,
  filterStage,
  modalStats,
  noneCount,
} from "./atoms";

export const isDateTimeField = selectorFamily<boolean, string>({
  key: "isDateTimeField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    if (map[name] === LIST_FIELD) {
      map = get(selectors.primitivesSubfieldMap("sample"));
    }

    return DATE_TIME_FIELD === map[name];
  },
});

export const isDateField = selectorFamily<boolean, string>({
  key: "isDateField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    if (map[name] === LIST_FIELD) {
      map = get(selectors.primitivesSubfieldMap("sample"));
    }

    return DATE_FIELD === map[name];
  },
});

export const isNumericField = selectorFamily<boolean, string>({
  key: "isNumericField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    if (VALID_LIST_FIELDS.includes(map[name])) {
      map = get(selectors.primitivesSubfieldMap("sample"));
    }

    return VALID_NUMERIC_TYPES.includes(map[name]);
  },
});

export const isSupportField = selectorFamily<boolean, string>({
  key: "isSupportField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    return FRAME_SUPPORT_FIELD === map[name];
  },
});

export const isIntField = selectorFamily<boolean, string>({
  key: "isIntField",
  get: (name) => ({ get }) => {
    let map = get(selectors.primitivesMap("sample"));

    if (VALID_LIST_FIELDS.includes(map[name])) {
      map = get(selectors.primitivesSubfieldMap("sample"));
    }

    return [FRAME_SUPPORT_FIELD, INT_FIELD].includes(map[name]);
  },
});

type NumericFilter = {
  range: Range;
  none: boolean;
  nan: boolean;
  ninf: boolean;
  inf: boolean;
  _CLS: string;
};

const getFilter = (
  get: GetRecoilValue,
  modal: boolean,
  path: string,
  defaultRange?: Range
): NumericFilter => {
  const bounds = get(boundsAtom({ path, defaultRange }));
  const result = {
    _CLS: "numeric",
    ...{
      range: bounds,
      none: true,
      nan: true,
      inf: true,
      ninf: true,
    },
    ...get(filterStage({ modal, path })),
  };
  if (
    !meetsDefault(
      { ...result, none: true, nan: true, inf: true, ninf: true },
      bounds
    )
  ) {
    return { ...result, none: false, nan: false, ninf: false, inf: false };
  }
  return result;
};

const meetsDefault = (filter: NumericFilter, bounds: Range) => {
  return (
    filter.range.every((r, i) => r === bounds[i]) &&
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

  const check = { ...filter, none: true, nan: true, ninf: true, inf: true };
  if (["none", "ninf", "nan", "inf"].includes(key)) {
    check[key] = Boolean(value);
  }

  if (meetsDefault(check, bounds)) {
    set(filterStage({ modal, path }), null);
  } else {
    set(filterStage({ modal, path }), { ...filter, none: false });
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
    const isDateOrDateTime =
      get(isDateTimeField(path)) || get(isDateField(path));

    let bounds = (get(selectors.datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (cur.name !== path || cur._CLS !== AGGS.BOUNDS) {
          return acc;
        }

        if (isDateOrDateTime) {
          return cur.result.map((v) => (v ? v.datetime : v));
        }

        if (cur.result.bounds) {
          return cur.result.bounds;
        }

        return cur.result;
      },
      [null, null]
    );

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

export const otherAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
    key: "nan" | "none" | "inf" | "ninf";
  }
>({
  key: "otherAtom",
  get: ({ defaultRange, modal, path, key }) => ({ get }) =>
    getFilter(get, modal, path, defaultRange)[key],
  set: ({ defaultRange, modal, path, key }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, key, value, defaultRange),
});

export interface OtherCounts {
  none: number;
  inf?: number;
  ninf?: number;
  nan?: number;
}

export const otherCounts = selectorFamily<
  OtherCounts,
  { modal: boolean; path: string }
>({
  key: "otherFilteredCounts",
  get: ({ modal, path }) => ({ get }) => {
    const none = get(noneCount({ modal, path }));
    const type = get(selectors.fieldType(path));
    const subType = get(selectors.subfieldType(path));
    if ([type, subType].includes(FLOAT_FIELD)) {
      let { inf, "-inf": ninf, nan } = (
        get(modal ? modalStats : selectors.datasetStats) ?? []
      ).reduce(
        (acc, cur) => {
          if (cur.name !== path || cur._CLS !== AGGS.BOUNDS) {
            return acc;
          }

          if (cur.result.bounds) {
            return cur.result;
          }

          return cur.result;
        },
        { nan: 0, ninf: 0, inf: 0 }
      );
      return {
        none,
        inf,
        ninf,
        nan,
      };
    }
    return { none };
  },
});

export const otherFilteredCounts = selectorFamily<
  OtherCounts,
  { modal: boolean; path: string }
>({
  key: "otherFilteredCounts",
  get: ({ modal, path }) => ({ get }) => {
    const none = get(noneCount({ modal, path }));
    const type = get(selectors.fieldType(path));
    const subType = get(selectors.subfieldType(path));
    if ([type, subType].includes(FLOAT_FIELD)) {
      let { inf, "-inf": ninf, nan } = (
        get(modal ? extendedModalStats : selectors.extendedDatasetStats) ?? []
      ).reduce(
        (acc, cur) => {
          if (cur.name !== path || cur._CLS !== AGGS.BOUNDS) {
            return acc;
          }

          if (cur.result.bounds) {
            return cur.result;
          }

          return cur.result;
        },
        { nan: 0, ninf: 0, inf: 0 }
      );
      return {
        none,
        inf,
        ninf,
        nan,
      };
    }
    return { none };
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
  get: ({ path, defaultRange, modal }) => ({ get }) => {
    const [none, nan, ninf, inf, range] = [
      get(otherAtom({ modal, path, defaultRange, key: "none" })),
      get(otherAtom({ modal, path, defaultRange, key: "nan" })),
      get(otherAtom({ modal, path, defaultRange, key: "ninf" })),
      get(otherAtom({ modal, path, defaultRange, key: "inf" })),
      get(rangeAtom({ modal, path, defaultRange })),
    ];
    const bounds = get(boundsAtom({ path, defaultRange }));

    return (
      !none ||
      !nan ||
      !ninf ||
      !inf ||
      (bounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) &&
        bounds[0] !== bounds[1])
    );
  },
});
