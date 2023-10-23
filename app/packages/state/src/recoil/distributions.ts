import {
  countValues as countValuesGraphQL,
  countValuesQuery,
  histogramValues as histogramValuesGraphQL,
  histogramValuesQuery,
} from "@fiftyone/relay";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DETECTION,
  DETECTIONS,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
  KEYPOINT,
  KEYPOINTS,
  LABELS_PATH,
  LIST_FIELD,
  POLYLINE,
  POLYLINES,
  STRING_FIELD,
  VALID_DISTRIBUTION_TYPES,
  withPath,
} from "@fiftyone/utilities";
import { VariablesOf } from "react-relay";
import { selector, selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { extendedSelection } from "./atoms";
import { filters } from "./filters";
import { groupSlice, groupStatisticsState } from "./groups";
import { RelayEnvironmentKey } from "./relay";
import { field, fieldPaths } from "./schema";
import { datasetName } from "./selectors";
import { State } from "./types";
import { view } from "./view";

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
      slice: get(groupSlice),
      mixed: get(groupStatisticsState) === "group",
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
      const f = get(field(path));
      let ftype = f.ftype;
      if (ftype === LIST_FIELD) {
        ftype = f.subfield;
      }
      const data = get(countValuesData(path));

      switch (ftype) {
        case BOOLEAN_FIELD:
          if (data.__typename === "BoolCountValuesResponse") {
            return data;
          }
          break;
        case STRING_FIELD:
          if (data.__typename === "StrCountValuesResponse") {
            return data;
          }
      }
      throw new Error("invalid request");
    },
});

export const histogramValues = selectorFamily({
  key: "histogramValues",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));
      let ftype = f.ftype;
      if (ftype === LIST_FIELD) {
        ftype = f.subfield;
      }
      const data = get(histogramValuesData(path));

      switch (ftype) {
        case INT_FIELD:
          if (data.__typename === "IntHistogramValuesResponse") {
            return data;
          }
          break;
        case DATE_FIELD:
          if (data.__typename === "DatetimeHistogramValuesResponse") {
            return data;
          }
          break;
        case DATE_TIME_FIELD:
          if (data.__typename === "DatetimeHistogramValuesResponse") {
            return data;
          }
          break;
        case FLOAT_FIELD:
          if (data.__typename === "FloatHistogramValuesResponse") {
            return data;
          }
          break;
      }

      throw new Error("invalid request");
    },
});

export const distribution = selectorFamily({
  key: "distribution",
  get:
    (path: string) =>
    ({ get }) => {
      const f = get(field(path));
      let ftype = f.ftype;
      if (ftype === LIST_FIELD) {
        ftype = f.subfield;
      }

      switch (ftype) {
        case BOOLEAN_FIELD:
          return get(countValues(path));
        case DATE_FIELD:
          return get(histogramValues(path));
        case DATE_TIME_FIELD:
          return get(histogramValues(path));
        case FLOAT_FIELD:
          return get(histogramValues(path));
        case FRAME_NUMBER_FIELD:
          return get(histogramValues(path));
        case FRAME_SUPPORT_FIELD:
          return get(histogramValues(path));
        case INT_FIELD:
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

export const distributionPaths = selector<string[]>({
  key: "distributionPaths",
  get: ({ get }) =>
    get(
      fieldPaths({
        space: State.SPACE.SAMPLE,
        ftype: VALID_DISTRIBUTION_TYPES,
      })
    )
      .filter((path) => !["filepath", "id"].includes(path))
      .filter((path) => {
        const keys = path.split(".");
        const parent = get(field(keys.slice(0, -1).join(".")));
        return (
          !parent ||
          !SKIP_FIELDS[parent.embeddedDocType] ||
          !SKIP_FIELDS[parent.embeddedDocType].includes(keys.slice(-1)[0])
        );
      })
      .sort(),
});
