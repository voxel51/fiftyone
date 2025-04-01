import { VALID_KEYPOINTS } from "@fiftyone/utilities";
import { selectorFamily } from "recoil";
import { aggregation } from "../aggregations";
import { datasetSampleCount } from "../dataset";
import * as filterAtoms from "../filters";
import { queryPerformance } from "../queryPerformance";
import * as schemaAtoms from "../schema";
import * as selectors from "../selectors";
import { MATCH_LABEL_TAGS } from "../sidebar";
import * as viewAtoms from "../view";
import { booleanCountResults } from "./boolean";
import { gatherPaths } from "./utils";

export const count = selectorFamily({
  key: "count",
  get:
    ({
      value,
      ...params
    }: {
      extended: boolean;
      path: string;
      modal: boolean;
      lightning?: boolean;
      value?: string | null;
    }) =>
    ({ get }): number => {
      if (params.path === "_") {
        const data = get(aggregation({ ...params, path: "" }));

        if (data.__typename !== "RootAggregation") {
          throw new Error("unexpected");
        }

        return data.slice;
      }

      if (
        !params.modal &&
        params.path === "" &&
        !get(viewAtoms.view).length &&
        get(queryPerformance)
      ) {
        if (
          !get(filterAtoms.hasFilters(false)) ||
          (!params.extended && !params.lightning)
        )
          return get(datasetSampleCount);
      }

      const exists =
        Boolean(get(schemaAtoms.field(params.path))) || !params.path;

      if (!exists) {
        const split = params.path.split(".");
        const [first] = split;

        if (first === "tags") {
          return get(counts({ ...params, path: "tags" }))[
            split.slice(1).join(".")
          ];
        }

        if (first === "_label_tags" && !value) {
          const r = get(cumulativeCounts({ ...params, ...MATCH_LABEL_TAGS }));
          return Object.values(r).reduce((a, b) => a + b, 0);
        }

        if (first === "_label_tags" && value) {
          return (
            get(cumulativeCounts({ ...params, ...MATCH_LABEL_TAGS }))[value] ??
            0
          );
        }

        if (split.length < 2) {
          // this will never resolve, which allows for incoming schema changes
          // this shouldn't be necessary, but there is a mismatch between
          // aggs and schema when there is a field change
          throw new Promise(() => undefined);
        }

        const parent = split.slice(0, split.length - 1).join(".");

        return get(counts({ ...params, path: parent }))[
          split[split.length - 1]
        ];
      }

      if (value === null) {
        return get(noneCount(params));
      }

      if (value !== undefined) {
        return get(counts(params))[value] || 0;
      }

      return get(aggregation(params))?.count as number;
    },
});

export const counts = selectorFamily({
  key: "counts",
  get:
    (params: { extended: boolean; path: string; modal: boolean }) =>
    ({ get }): { [key: string]: number } => {
      const exists = Boolean(get(schemaAtoms.field(params.path)));

      if (!exists) {
        const parent = params.path.split(".")[0];

        if (
          VALID_KEYPOINTS.includes(
            get(schemaAtoms.field(parent))?.embeddedDocType
          )
        ) {
          const skeleton = get(selectors.skeleton(parent));

          return skeleton.labels.reduce((acc, cur) => {
            acc[cur] = -1;
            return acc;
          }, {});
        }
      }

      const data = get(aggregation(params));
      if (!data) {
        return {};
      }

      if (data.__typename === "StringAggregation") {
        return Object.fromEntries(
          data.values.map(({ count, value }) => [value, count])
        );
      }

      if (data.__typename !== "BooleanAggregation") {
        throw new Error("unexpected");
      }

      return Object.fromEntries(
        get(booleanCountResults(params)).results.map(({ value, count }) => [
          value,
          count,
        ])
      );
    },
});

export const gatheredPaths = selectorFamily({
  key: "gatheredPaths",
  get:
    ({
      embeddedDocType,
      ftype,
    }: {
      embeddedDocType?: string | string[];
      ftype: string | string[];
    }) =>
    ({ get }) => {
      return [...new Set(gatherPaths(get, ftype, embeddedDocType))];
    },
});

export const cumulativeCounts = selectorFamily<
  { [key: string]: number },
  {
    extended: boolean;
    path: string;
    modal: boolean;
    ftype: string | string[];
    embeddedDocType?: string | string[];
  }
>({
  key: "cumulativeCounts",
  get:
    ({ extended, path: key, modal, ftype, embeddedDocType }) =>
    ({ get }) => {
      return get(gatheredPaths({ ftype, embeddedDocType })).reduce(
        (result, path) => {
          const data = get(counts({ extended, modal, path: `${path}.${key}` }));
          for (const value in data) {
            if (!result[value]) {
              result[value] = 0;
            }

            result[value] += data[value];
          }
          return result;
        },
        {}
      );
    },
});

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean; extended: boolean }
>({
  key: "noneCount",
  get:
    (params) =>
    ({ get }) => {
      const { count: aggCount = 0 } = get(aggregation(params)) ?? {};

      const parent = params.path.split(".").slice(0, -1).join(".");
      const isLabelTag = params.path.startsWith("_label_tags");
      return get(schemaAtoms.isListField(params.path)) || isLabelTag
        ? 0
        : (get(count({ ...params, path: parent })) as number) - aggCount;
    },
});
