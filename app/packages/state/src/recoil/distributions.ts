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

import type { ResponseFrom } from "../utils";

import { RelayEnvironmentKey } from "./relay";

import { datasetName } from "./selectors";
import { view } from "./view";
import { selectorFamily } from "recoil";
import { field } from "./schema";
import { LIST_FIELD } from "@fiftyone/utilities";

const boolCountValues = graphQLSelectorFamily<
  VariablesOf<countValuesBoolQuery>,
  string,
  ResponseFrom<countValuesBoolQuery>
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
  mapResponse: (data) => data,
});

const intCountValues = graphQLSelectorFamily<
  VariablesOf<countValuesIntQuery>,
  string,
  ResponseFrom<countValuesIntQuery>
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
  mapResponse: (data) => data,
});

const strCountValues = graphQLSelectorFamily<
  VariablesOf<countValuesStrQuery>,
  string,
  ResponseFrom<countValuesStrQuery>
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
  mapResponse: (data) => data,
});

const datetimeHistogramValues = graphQLSelectorFamily<
  VariablesOf<histogramValuesDatetimeQuery>,
  string,
  ResponseFrom<histogramValuesDatetimeQuery>
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
  mapResponse: (data) => data,
});

const intHistogramValues = graphQLSelectorFamily<
  VariablesOf<histogramValuesIntQuery>,
  string,
  ResponseFrom<histogramValuesIntQuery>
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
  mapResponse: (data) => data,
});

const floatHistogramValues = graphQLSelectorFamily<
  VariablesOf<histogramValuesFloatQuery>,
  string,
  ResponseFrom<histogramValuesFloatQuery>
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
  mapResponse: (data) => data,
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

      console.log(ftype);
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

      console.log(ftype);
    },
});
