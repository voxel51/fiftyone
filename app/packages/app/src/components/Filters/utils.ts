import { Point } from "@fiftyone/looker";
import { selectorFamily } from "recoil";
import { Nonfinite } from "../../recoil/aggregations";
import { filters, modalFilters } from "../../recoil/filters";
import { expandPath } from "../../recoil/schema";
import { Range } from "../Common/RangeSlider";

const NONSTRING_VALUES: any[] = [false, true, null];
const STRING_VALUES = ["False", "True", "None"];

export const getValueString = (value): [string, boolean] => {
  if (NONSTRING_VALUES.includes(value)) {
    return [STRING_VALUES[NONSTRING_VALUES.indexOf(value)], true];
  }

  if (typeof value === "number") {
    return [value.toLocaleString(), true];
  }

  if (typeof value === "string" && !value.length) {
    return [`""`, true];
  }

  if (Array.isArray(value)) {
    return [`[${value.map((v) => getValueString(v)[0]).join(", ")}]`, false];
  }

  return [value as string, false];
};

export interface NumericFilter {
  range: Range;
  none: boolean;
  nan: boolean;
  ninf: boolean;
  inf: boolean;
  exclude: boolean;
  _CLS: string;
}

export interface StringFilter {
  values: string[];
  exclude: boolean;
  _CLS: "str";
}

export const skeletonFilter = selectorFamily<
  (path: string, value: Point) => boolean,
  boolean
>({
  key: "skeletonFilter",
  get: (modal) => ({ get, getCallback }) => {
    const f = get(modal ? modalFilters : filters);
    return getCallback(({ snapshot }) => (path: string, value: Point) => {
      path = snapshot.getLoadable(expandPath(path)).contents;
      const labels = f[`${path}.points`] as StringFilter;

      if (labels && labels.values.length && value.label) {
        const included = labels.values.includes(value.label);
        if (labels.exclude) {
          if (included) {
            return false;
          }
        } else if (!labels.exclude) {
          if (!included) {
            return false;
          }
        }
      }

      const confidence = f[`${path}.confidence`] as NumericFilter;

      if (confidence) {
        if (typeof value.confidence !== "number") {
          switch (value.confidence) {
            case "inf":
              return confidence.inf ? !confidence.exclude : confidence.exclude;
            case "ninf":
              return confidence.ninf ? !confidence.exclude : confidence.exclude;
            case "nan":
              return confidence.nan ? !confidence.exclude : confidence.exclude;
            case null:
              return confidence.none ? !confidence.exclude : confidence.exclude;
            case undefined:
              return confidence.none ? !confidence.exclude : confidence.exclude;
          }
        }

        const includes =
          value.confidence >= confidence.range[0] &&
          value.confidence <= confidence.range[1];

        return includes ? !confidence.exclude : confidence.exclude;
      }

      return true;
    });
  },
});
