import { VariablesOf } from "react-relay";
import { graphQLSelectorFamily } from "recoil-relay";

import {
  countValues as countValuesGraphQL,
  countValuesQuery,
  histogramValues as histogramValuesGraphQL,
  histogramValuesQuery,
} from "@fiftyone/relay";

import { RelayEnvironmentKey } from "./relay";

import { datasetName } from "./selectors";
import { view } from "./view";
import { selector, selectorFamily } from "recoil";
import { expandPath, fieldPaths, field, labelFields, fields } from "./schema";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DETECTION,
  DETECTIONS,
  EMBEDDED_DOCUMENT_FIELD,
  FLOAT_FIELD,
  INT_FIELD,
  KEYPOINT,
  KEYPOINTS,
  LABELS,
  LABELS_PATH,
  LIST_FIELD,
  POLYLINE,
  POLYLINES,
  STRING_FIELD,
  VALID_DISTRIBUTION_TYPES,
  withPath,
} from "@fiftyone/utilities";
import { State } from "./types";
import { extendedSelection } from "./atoms";
import { filters } from "./filters";
import { groupSlice, groupStatistics } from "./groups";

/**
 * A generic type that extracts the response type from a GraphQL query.
 */
export type AggregationResponseFrom<
  TAggregate extends { response: { aggregate: readonly unknown[] } }
> = TAggregate["response"]["aggregate"][0];

const extendedViewForm = selector({
  key: "extendedViewForm",
  get: ({ get }) => {
    return {
      sampleIds: get(extendedSelection)?.selection,
      filters: get(filters),
      slice: get(groupSlice(false)),
      mixed: get(groupStatistics(false)) === "group",
    };
  },
});

const countValuesData = graphQLSelectorFamily<
  VariablesOf<countValuesQuery>,
  string,
  AggregationResponseFrom<countValuesQuery>
>({
  key: "countValuesData",
  environment: RelayEnvironmentKey,
  query: countValuesGraphQL,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
        form: get(extendedViewForm),
      };
    },
  mapResponse: (data: countValuesQuery["response"]) => data.aggregate[0],
});

const histogramValuesData = graphQLSelectorFamily<
  VariablesOf<histogramValuesQuery>,
  string,
  AggregationResponseFrom<histogramValuesQuery>
>({
  key: "histogramValuesData",
  environment: RelayEnvironmentKey,
  query: histogramValuesGraphQL,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
        form: get(extendedViewForm),
      };
    },
  mapResponse: (data) => data.aggregate[0],
});

export const countValues = selectorFamily({
  key: "countValues",
  get:
    (path: string) =>
    ({ get }) => {
      let { ftype, subfield } = get(field(path));
      if (ftype === LIST_FIELD) {
        ftype = subfield;
      }
      const data = get(countValuesData(path));

      switch (ftype) {
        case BOOLEAN_FIELD:
          if (data.__typename === "BoolCountValuesResponse") {
            return data;
          }
        case STRING_FIELD:
          if (data.__typename === "StrCountValuesResponse") {
            return data;
          }
        default:
          throw new Error("invalid request");
      }
    },
});

export const histogramValues = selectorFamily({
  key: "histogramValues",
  get:
    (path: string) =>
    ({ get }) => {
      let { ftype, subfield } = get(field(path));
      if (ftype === LIST_FIELD) {
        ftype = subfield;
      }
      const data = get(histogramValuesData(path));

      switch (ftype) {
        case INT_FIELD:
          if (data.__typename === "IntHistogramValuesResponse") {
            return data;
          }
        case DATE_FIELD:
          if (data.__typename === "DatetimeHistogramValuesResponse") {
            return data;
          }
        case DATE_TIME_FIELD:
          if (data.__typename === "DatetimeHistogramValuesResponse") {
            return data;
          }
        case FLOAT_FIELD:
          if (data.__typename === "FloatHistogramValuesResponse") {
            return data;
          }
        default:
          throw new Error("invalid request");
      }
    },
});

export const distribution = selectorFamily({
  key: "distribution",
  get:
    (path: string) =>
    ({ get }) => {
      let { ftype, subfield } = get(field(path));
      if (ftype === LIST_FIELD) {
        ftype = subfield;
      }
      switch (ftype) {
        case BOOLEAN_FIELD:
          return get(countValues(path));
        case DATE_FIELD:
          return get(histogramValues(path));
        case DATE_TIME_FIELD:
          return get(histogramValues(path));
        case INT_FIELD:
          return get(histogramValues(path));
        case FLOAT_FIELD:
          return get(histogramValues(path));
        case STRING_FIELD:
          return get(countValues(path));
        default:
          throw new Error("no distribution");
      }
    },
});

const SKIP_FIELDS = {
  [withPath(LABELS_PATH, DETECTION)]: ["bounding_box"],
  [withPath(LABELS_PATH, DETECTIONS)]: ["bounding_box"],
  [withPath(LABELS_PATH, KEYPOINT)]: ["points"],
  [withPath(LABELS_PATH, KEYPOINTS)]: ["points"],
  [withPath(LABELS_PATH, POLYLINE)]: ["points"],
  [withPath(LABELS_PATH, POLYLINES)]: ["points"],
};

export const distributionPaths = selectorFamily<string[], string>({
  key: "distributionPaths",
  get:
    (group) =>
    ({ get }) => {
      group = group.toLowerCase();

      switch (group) {
        case "labels":
          const labels = get(labelFields({})).map((l) => [
            l,
            get(expandPath(l)),
          ]);
          let paths = [];
          for (let index = 0; index < labels.length; index++) {
            const [parentPath, path] = labels[index];
            paths = [
              ...paths,
              ...get(fields({ path, ftype: VALID_DISTRIBUTION_TYPES }))
                .filter(({ name }) => {
                  const parent = get(field(parentPath));

                  return (
                    !SKIP_FIELDS[parent.embeddedDocType] ||
                    !SKIP_FIELDS[parent.embeddedDocType].includes(name)
                  );
                })
                .map(({ name }) => [path, name].join(".")),
            ];
          }
          return paths;
        case "label tags":
          return get(labelFields({})).map((l) => get(expandPath(l)) + ".tags");
        case "sample tags":
          return ["tags"];
        case "other fields":
          const top = get(
            fieldPaths({
              space: State.SPACE.SAMPLE,
              ftype: VALID_DISTRIBUTION_TYPES,
            })
          ).filter((path) => !["filepath", "tags"].includes(path));

          const embedded = get(
            fieldPaths({
              space: State.SPACE.SAMPLE,
              ftype: EMBEDDED_DOCUMENT_FIELD,
            })
          );

          return [
            ...top,
            ...embedded
              .filter(
                (path) => !LABELS.includes(get(field(path)).embeddedDocType)
              )
              .flatMap((path) =>
                get(fieldPaths({ path, ftype: VALID_DISTRIBUTION_TYPES })).map(
                  (name) => [path, name].join(".")
                )
              ),
          ];
        default:
          throw new Error("unknown group");
      }
    },
});

export const noDistributionPathsData = selectorFamily<boolean, string>({
  key: "noDistributionPathsData",
  get:
    (group) =>
    ({ get }) => {
      const paths = get(distributionPaths(group));

      return paths.every((path) => {
        const data = get(distribution(path));

        switch (data.__typename) {
          case "BoolCountValuesResponse":
            return !data.values.length;
          case "IntHistogramValuesResponse":
            return data.counts.length === 1 && data.counts[0] === 0;
          case "DatetimeHistogramValuesResponse":
            return data.counts.length === 1 && data.counts[0] === 0;
          case "FloatHistogramValuesResponse":
            return data.counts.length === 1 && data.counts[0] === 0;
          case "StrCountValuesResponse":
            return !data.values.length;
          default:
            throw new Error("invalid request");
        }
      });
    },
});
