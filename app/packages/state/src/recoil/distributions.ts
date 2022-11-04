import { VariablesOf } from "react-relay";
import { graphQLSelectorFamily } from "recoil-relay";

import {
  countValuesBool,
  countValuesBoolQuery,
  countValuesInt,
  countValuesIntQuery,
  countValuesStr,
  countValuesStrQuery,
  histogramValuesDatetime,
  histogramValuesDatetimeQuery,
  histogramValuesFloat,
  histogramValuesFloatQuery,
  histogramValuesInt,
  histogramValuesIntQuery,
} from "@fiftyone/relay";

import { RelayEnvironmentKey } from "./relay";

import { datasetName } from "./selectors";
import { view } from "./view";
import { selectorFamily } from "recoil";
import { expandPath, fieldPaths, field, labelFields, fields } from "./schema";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DETECTION,
  FLOAT_FIELD,
  INT_FIELD,
  KEYPOINT,
  LABELS_PATH,
  LIST_FIELD,
  POLYLINE,
  STRING_FIELD,
  VALID_DISTRIBUTION_TYPES,
  withPath,
} from "@fiftyone/utilities";
import { State } from "./types";

export type AggregationResponseFrom<
  TAggregate extends { response: { aggregate: readonly unknown[] } }
> = TAggregate["response"]["aggregate"][0];

const boolCountValues = graphQLSelectorFamily<
  VariablesOf<countValuesBoolQuery>,
  string,
  AggregationResponseFrom<countValuesBoolQuery>
>({
  key: "boolCountValues",
  environment: RelayEnvironmentKey,
  query: countValuesBool,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
      };
    },
  mapResponse: (data) => data.aggregate[0],
});

const intCountValues = graphQLSelectorFamily<
  VariablesOf<countValuesIntQuery>,
  string,
  AggregationResponseFrom<countValuesIntQuery>
>({
  key: "intCountValues",
  environment: RelayEnvironmentKey,
  query: countValuesInt,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
      };
    },
  mapResponse: (data) => data.aggregate[0],
});

const strCountValues = graphQLSelectorFamily<
  VariablesOf<countValuesStrQuery>,
  string,
  AggregationResponseFrom<countValuesStrQuery>
>({
  key: "strCountValues",
  environment: RelayEnvironmentKey,
  query: countValuesStr,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
      };
    },
  mapResponse: (data) => data.aggregate[0],
});

const datetimeHistogramValues = graphQLSelectorFamily<
  VariablesOf<histogramValuesDatetimeQuery>,
  string,
  AggregationResponseFrom<histogramValuesDatetimeQuery>
>({
  key: "datetimeHistogramValues",
  environment: RelayEnvironmentKey,
  query: histogramValuesDatetime,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
      };
    },
  mapResponse: (data) => data.aggregate[0],
});

const intHistogramValues = graphQLSelectorFamily<
  VariablesOf<histogramValuesIntQuery>,
  string,
  AggregationResponseFrom<histogramValuesIntQuery>
>({
  key: "datetimeHistogramValues",
  environment: RelayEnvironmentKey,
  query: histogramValuesInt,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
      };
    },
  mapResponse: (data) => data.aggregate[0],
});

const floatHistogramValues = graphQLSelectorFamily<
  VariablesOf<histogramValuesFloatQuery>,
  string,
  AggregationResponseFrom<histogramValuesFloatQuery>
>({
  key: "floatHistogramValues",
  environment: RelayEnvironmentKey,
  query: histogramValuesFloat,
  variables:
    (path) =>
    ({ get }) => {
      return {
        dataset: get(datasetName),
        view: get(view),
        path,
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

      switch (ftype) {
        case BOOLEAN_FIELD:
          return get(boolCountValues(path));
        case STRING_FIELD:
          return get(strCountValues(path));
        default:
          throw new Error("invalid");
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
      switch (ftype) {
        case INT_FIELD:
          return get(intHistogramValues(path));
        case DATE_FIELD:
          return get(datetimeHistogramValues(path));
        case DATE_TIME_FIELD:
          return get(datetimeHistogramValues(path));
        case FLOAT_FIELD:
          return get(floatHistogramValues(path));
        default:
          throw new Error("invalid");
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
  [withPath(LABELS_PATH, KEYPOINT)]: ["points"],
  [withPath(LABELS_PATH, POLYLINE)]: ["points"],
};

export const distributionPaths = selectorFamily<string[], string>({
  key: "distributionPaths",
  get:
    (group) =>
    ({ get }) => {
      group = group.toLowerCase();

      switch (group) {
        case "labels":
          const labels = get(labelFields({})).map((l) => get(expandPath(l)));
          let paths = [];
          for (let index = 0; index < labels.length; index++) {
            const path = labels[index];
            paths = [
              ...paths,
              ...get(fields({ path, ftype: VALID_DISTRIBUTION_TYPES }))
                .filter(({ name }) => {
                  console.log(path);
                  const parent = get(field(path));

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
          return get(
            fieldPaths({
              space: State.SPACE.SAMPLE,
              ftype: VALID_DISTRIBUTION_TYPES,
            })
          ).filter((path) => !["filepath", "tags"].includes(path));
        default:
          throw new Error("unknown group");
      }
    },
});
