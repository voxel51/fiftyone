import { Point } from "@fiftyone/looker";
import { initial } from "lodash";
import { selectorFamily } from "recoil";
import { filters, modalFilters } from "./filters";
import { BooleanFilter } from "./pathFilters/boolean";
import { NumericFilter } from "./pathFilters/numeric";
import { StringFilter } from "./pathFilters/string";
import { expandPath } from "./schema";

export default selectorFamily<(path: string, value: Point) => boolean, boolean>(
  {
    key: "skeletonFilter",
    get:
      (modal) =>
      ({ get, getCallback }) => {
        const f = get(modal ? modalFilters : filters);
        return getCallback(({ snapshot }) => (path: string, value: Point) => {
          path = snapshot.getLoadable(expandPath(path)).contents;
          let result: boolean = true;

          const stringListFilters: string[] = [];
          const numberListFilters: string[] = [];
          const booleanListFilters: string[] = [];

          Object.entries(value).forEach(([k, v]) => {
            if (typeof v === "string" && !["label"].includes(k)) {
              stringListFilters.push(k);
            }
            if (typeof v === "number") {
              numberListFilters.push(k);
            }
            if (typeof v === "boolean") {
              booleanListFilters.push(k);
            }
          });

          // skeleton points is a special case:
          const labels = f[`${path}.points`] as StringFilter;
          if (labels && labels.values.length && value.label) {
            const included = labels.values.includes(value.label);
            if (labels.exclude) {
              if (included) {
                result = false;
              }
            } else if (!labels.exclude) {
              if (!included) {
                result = false;
              }
            }
          }

          stringListFilters.forEach((key) => {
            const strFilter = f[`${path}.${key}`] as StringFilter;
            if (strFilter && strFilter.values.length && value[key]) {
              const included = strFilter.values.includes(value[key]);
              if (strFilter.exclude) {
                if (included) {
                  result = false;
                }
              } else if (!strFilter.exclude) {
                if (!included) {
                  result = false;
                }
              }
            }
          });

          numberListFilters.forEach((key) => {
            const numFilter = f[`${path}.${key}`] as NumericFilter;
            if (numFilter) {
              if (typeof value[key] !== "number") {
                switch (value[key]) {
                  case "inf":
                    return numFilter.inf
                      ? !numFilter.exclude
                      : numFilter.exclude;
                  case "ninf":
                    return numFilter.ninf
                      ? !numFilter.exclude
                      : numFilter.exclude;
                  case "nan":
                    return numFilter.nan
                      ? !numFilter.exclude
                      : numFilter.exclude;
                  case null:
                    return numFilter.none
                      ? !numFilter.exclude
                      : numFilter.exclude;
                  case undefined:
                    return numFilter.none
                      ? !numFilter.exclude
                      : numFilter.exclude;
                }
              }

              const includes =
                value[key] >= numFilter.range[0] &&
                value[key] <= numFilter.range[1];
              const r = numFilter.exclude ? !includes : includes;

              if (!r) {
                result = false;
              }
            }
          });

          booleanListFilters.forEach((key) => {
            const boolFilter = f[`${path}.${key}`] as BooleanFilter;
            const v = value[key];
            const trueBool = boolFilter?.true;
            const falseBool = boolFilter?.false;
            const noneBool = boolFilter?.none;

            const trueConditions =
              (v === true && trueBool) ||
              (v === false && falseBool) ||
              ([null, undefined].includes(v) && noneBool);

            const initialState =
              trueBool == undefined &&
              falseBool == undefined &&
              noneBool == undefined;

            if (!trueConditions) {
              if (!initialState) {
                result = false;
              }
            }
          });

          return result;
        });
      },
  }
);
