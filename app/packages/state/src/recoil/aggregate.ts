import { aggregate, aggregateQuery } from "@fiftyone/relay";
import { graphQLSelectorFamily } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { ResponseFrom } from "../utils";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { view } from "./view";

export const aggregateSelectorFamily = graphQLSelectorFamily<
  VariablesOf<aggregateQuery>,
  { paths: string[] },
  ResponseFrom<aggregateQuery>
>({
  key: "aggregateSelectorFamily",
  query: aggregate,
  environment: RelayEnvironmentKey,
  variables:
    ({ paths }) =>
    ({ get }) => {
      return {
        view: get(view),
        dataset: get(datasetName),
        aggregations: paths.map((path) => ({ count: { field: path } })),
      };
    },
  mapResponse: (data) => data,
});
