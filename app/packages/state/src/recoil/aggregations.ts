import * as foq from "@fiftyone/relay";
import type { VariablesOf } from "react-relay";
import { selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import type { ResponseFrom } from "../utils";
import { refresher } from "./atoms";
import * as filterAtoms from "./filters";
import {
  currentSlices,
  groupId,
  groupSlice,
  groupSlices,
  groupStatistics,
} from "./groups";
import { sidebarSampleId } from "./modal";
import { RelayEnvironmentKey } from "./relay";
import * as schemaAtoms from "./schema";
import * as selectors from "./selectors";
import { State } from "./types";
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

      mixed = mixed || get(groupStatistics(modal)) === "group";
      const aggForm = {
        index: get(refresher),
        dataset,
        extendedStages: root ? [] : get(selectors.extendedStages),
        filters:
          extended && !root
            ? get(modal ? filterAtoms.modalFilters : filterAtoms.filters)
            : null,
        groupId: !root && modal ? get(groupId) || null : null,
        hiddenLabels: !root ? get(selectors.hiddenLabelsArray) : [],
        paths,
        mixed,
        sampleIds,
        slices: mixed ? get(groupSlices) : get(currentSlices(modal)),
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
      const paths = params.modal
        ? get(modalAggregationPaths({ path, mixed: params.mixed }))
        : get(schemaAtoms.filterFields(path));

      return get(
        aggregations({
          ...params,
          paths,
        })
      ).find((data) => data.path === path);
    },
});

export const modalAggregationPaths = selectorFamily({
  key: "modalAggregationPaths",
  get:
    (params: { path: string; mixed?: boolean }) =>
    ({ get }) => {
      const frames = get(
        schemaAtoms.labelFields({ space: State.SPACE.FRAME })
      ).map((path) => get(schemaAtoms.expandPath(path)));

      // separate frames path requests and sample path requests
      const isFramesPath = frames.some((p) => params.path.startsWith(p));
      let paths = isFramesPath
        ? frames
        : [
            ...get(schemaAtoms.labelFields({ space: State.SPACE.SAMPLE })).map(
              (path) => get(schemaAtoms.expandPath(path))
            ),
          ];

      paths = paths
        .sort()
        .flatMap((p) => get(schemaAtoms.modalFilterFields(p)));

      const numeric = get(schemaAtoms.isNumericField(params.path));
      if (!isFramesPath && !numeric) {
        // the modal currently requires a 'tags' aggregation
        paths = ["tags", ...paths];
      }

      if (params.mixed || get(groupId)) {
        paths = [
          ...paths.filter((p) => {
            const n = get(schemaAtoms.isNumericField(p));
            return numeric ? n : !n;
          }),
        ];
      }

      return paths;
    },
});
