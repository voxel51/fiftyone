import { Point } from "@fiftyone/looker";
import { selectorFamily } from "recoil";
import { filters, modalFilters } from "./filters";
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
                  return confidence.inf
                    ? !confidence.exclude
                    : confidence.exclude;
                case "ninf":
                  return confidence.ninf
                    ? !confidence.exclude
                    : confidence.exclude;
                case "nan":
                  return confidence.nan
                    ? !confidence.exclude
                    : confidence.exclude;
                case null:
                  return confidence.none
                    ? !confidence.exclude
                    : confidence.exclude;
                case undefined:
                  return confidence.none
                    ? !confidence.exclude
                    : confidence.exclude;
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
  }
);
