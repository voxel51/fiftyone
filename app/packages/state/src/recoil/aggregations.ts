import * as foq from "@fiftyone/relay";
import { VariablesOf } from "react-relay";
import { selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { ResponseFrom } from "../utils";
import { refresher } from "./atoms";
import * as filterAtoms from "./filters";
import { currentSlices, groupId, groupSlice, groupStatistics } from "./groups";
import { sidebarSampleId } from "./modal";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";

import * as viewAtoms from "./view";

type Aggregation = Exclude<
  ResponseFrom<foq.aggregationsQuery>["aggregations"][0],
  {
    readonly __typename: "%other";
  }
>;

/**
 * GraphQL Selector Family for Aggregations.
 * @param extended - Whether to use extended aggregations.
 */
export const aggregationQuery = graphQLSelectorFamily<
  VariablesOf<foq.aggregationsQuery>,
  {
    extended: boolean;
    modal: boolean;
    paths: string[];
    root?: boolean;
    mixed?: boolean;
    customView?: any;
    lightning?: boolean;
  },
  Aggregation[]
>({
  key: "aggregationQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) =>
    response.aggregations.filter((d) => d.__typename !== "%other"),
  query: foq.aggregation,
  variables:
    ({
      extended,
      modal,
      paths,
      root = false,
      mixed = false,
      customView = undefined,
      lightning = false,
    }) =>
    ({ get }) => {
      const dataset = get(selectors.datasetName);

      if (!dataset) return null;

      if (paths[0] !== "") {
        lightning = true;
      }

      mixed = mixed || get(groupStatistics(modal)) === "group";
      const aggForm = {
        index: get(refresher),
        dataset,
        extendedStages: root ? [] : get(selectors.extendedStages),
        filters:
          extended && !root
            ? get(modal ? filterAtoms.modalFilters : filterAtoms.filters)
            : !modal && !root && !extended && lightning
            ? get(filterAtoms.lightningFilters)
            : null,
        groupId: !root && modal ? get(groupId) || null : null,
        hiddenLabels: !root ? get(selectors.hiddenLabelsArray) : [],
        paths,
        mixed,
        sampleIds:
          !root && modal && !get(groupId) && !mixed
            ? [get(sidebarSampleId)]
            : [],
        slices: mixed ? null : get(currentSlices(modal)), // when mixed, slice is not needed
        slice: get(groupSlice),
        view: customView ? customView : !root ? get(viewAtoms.view) : [],
      };

      return {
        form: aggForm,
      };
    },
});

export const aggregations = selectorFamily({
  key: "aggregations",
  get:
    (params: {
      extended: boolean;
      lightning?: boolean;
      modal: boolean;
      paths: string[];
    }) =>
    ({ get }) => {
      if (params) {
        let extended = params.extended;
        if (extended && !get(filterAtoms.hasFilters(params.modal))) {
          extended = false;
        }

        return get(aggregationQuery({ ...params, extended }));
      }
      return [];
    },
});

export const aggregation = selectorFamily({
  key: "aggregation",
  get:
    ({
      path,
      ...params
    }: {
      extended: boolean;
      modal: boolean;
      path: string;
      mixed?: boolean;
      lightning?: boolean;
    }) =>
    ({ get }) => {
      return get(
        aggregations({
          ...params,
          paths: get(schemaAtoms.filterFields(path)),
        })
      ).filter((data) => data.path === path)[0];
    },
});
