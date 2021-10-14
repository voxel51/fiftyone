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
  FRAME_SUPPORT_FIELD,
  VALID_LIST_FIELDS,
  VALID_NUMERIC_TYPES,
} from "../../utils/labels";
import { filterStage } from "./atoms";

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

type NumericFilter = {
  range: Range;
  none: boolean;
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
    },
    ...get(filterStage({ modal, path })),
  };
  if (!meetsDefault({ ...result, none: true }, bounds)) {
    return { ...result, none: false };
  }
  return result;
};

const meetsDefault = (filter: NumericFilter, bounds: Range) => {
  return filter.range.every((r, i) => r === bounds[i]) && filter.none === true;
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

  const check = { ...filter, none: true };
  if (key === "none") {
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
    let bounds = (get(selectors.datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (cur.name === path && cur._CLS === AGGS.BOUNDS) {
          return cur.result;
        }
        return acc;
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

export const noneAtom = selectorFamily<
  boolean,
  {
    defaultRange?: Range;
    modal: boolean;
    path: string;
  }
>({
  key: "filterNumericFieldNone",
  get: ({ defaultRange, modal, path }) => ({ get }) =>
    getFilter(get, modal, path, defaultRange).none,
  set: ({ defaultRange, modal, path }) => ({ get, set }, value) =>
    setFilter(get, set, modal, path, "none", value, defaultRange),
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
    const [none, range] = [
      get(noneAtom({ modal, path, defaultRange })),
      get(rangeAtom({ modal, path, defaultRange })),
    ];
    const bounds = get(boundsAtom({ path, defaultRange }));

    return (
      !none ||
      (bounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) &&
        bounds[0] !== bounds[1])
    );
  },
});
