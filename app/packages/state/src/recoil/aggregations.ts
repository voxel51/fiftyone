import * as foq from "@fiftyone/relay";
import { VariablesOf } from "react-relay";
import { selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import { ResponseFrom } from "../utils";
import { refresher } from "./atoms";
import * as filterAtoms from "./filters";
import { currentSlices, groupId, groupSlice, groupStatistics } from "./groups";
import { lightning as lightningOn, lightningUnlocked } from "./lightning";
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
    customView?: any;
    extended: boolean;
    lightning?: boolean;
    modal: boolean;
    mixed?: boolean;
    paths: string[];
    root?: boolean;
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
      customView = undefined,
      extended,
      lightning,
      mixed = false,
      modal,
      paths,
      root = false,
    }) =>
    ({ get }) => {
      const dataset = get(selectors.datasetName);
      if (!dataset) return null;

      const useSidebarSampleId = !root && modal && !get(groupId) && !mixed;
      const sampleIds = useSidebarSampleId ? [get(sidebarSampleId)] : [];

      if (useSidebarSampleId && sampleIds[0] === null) {
        return null;
      }

      const lightningFilters =
        lightning ||
        (!modal &&
          !root &&
          !extended &&
          paths[0] !== "" &&
          get(lightningOn) &&
          get(lightningUnlocked));

      mixed = mixed || get(groupStatistics(modal)) === "group";
      const aggForm = {
        index: get(refresher),
        dataset,
        extendedStages: root ? [] : get(selectors.extendedStages),
        filters:
          extended && !root
            ? get(modal ? filterAtoms.modalFilters : filterAtoms.filters)
            : lightningFilters
            ? get(filterAtoms.lightningFilters)
            : null,
        groupId: !root && modal ? get(groupId) || null : null,
        hiddenLabels: !root ? get(selectors.hiddenLabelsArray) : [],
        paths,
        mixed,
        sampleIds,
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
      mixed?: boolean;
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
      lightning?: boolean;
      mixed?: boolean;
      modal: boolean;
      path: string;
    }) =>
    ({ get }) => {
      let paths = get(schemaAtoms.filterFields(path));
      let mixed = params.mixed;
      const numeric = get(schemaAtoms.isNumericField(path));
      if (params.modal) {
        paths = paths.filter((p) => {
          const n = get(schemaAtoms.isNumericField(p));
          return numeric ? n : !n;
        });
        // mixed only when in a group dataset
        mixed ||= Boolean(get(groupId) && numeric);
      }

      return get(
        aggregations({
          ...params,
          mixed,
          paths,
        })
      ).filter((data) => data.path === path)[0];
    },
});

export const dynamicGroupsElementCount = selectorFamily<number, string | null>({
  key: "dynamicGroupsElementCount",
  get:
    (groupByFieldValueExplicit: string | null = null) =>
    ({ get }) => {
      return (
        get(
          aggregationQuery({
            customView: get(
              viewAtoms.dynamicGroupViewQuery(
                groupByFieldValueExplicit ? { groupByFieldValueExplicit } : {}
              )
            ),
            extended: false,
            modal: false,
            paths: [""],
          })
        ).at(0)?.count ?? 0
      );
    },
});
