import * as foq from "@fiftyone/relay";
import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
  LIST_FIELD,
  OBJECT_ID_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import type { VariablesOf } from "react-relay";
import type { SerializableParam } from "recoil";
import { selectorFamily } from "recoil";
import { graphQLSelectorFamily } from "recoil-relay";
import type { ResponseFrom } from "../utils";
import { refresher } from "./atoms";
import { config } from "./config";
import * as filterAtoms from "./filters";
import {
  activeModalSidebarSample,
  currentSlices,
  groupId,
  groupSlice,
  groupSlices,
  groupStatistics,
} from "./groups";
import { sidebarSampleId } from "./modal";
import { activeIndex, queryPerformance } from "./queryPerformance";
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

export class AggregationQueryTimeout extends Error {
  constructor(readonly queryTime: number) {
    super();
  }
}

/**
 * GraphQL Selector Family for Aggregations.
 * @param extended - Whether to use extended aggregations.
 */
export const aggregationQuery = graphQLSelectorFamily<
  VariablesOf<foq.aggregationsQuery>,
  {
    dynamicGroup?: SerializableParam;
    extended: boolean;
    isQueryPerformance?: boolean;
    modal: boolean;
    mixed?: boolean;
    paths: string[];
    root?: boolean;
    useSelection?: boolean;
  },
  Aggregation[] | null
>({
  key: "aggregationQuery",
  environment: RelayEnvironmentKey,
  mapResponse: (response) =>
    response.aggregations.filter((d) => d.__typename !== "%other"),
  query: foq.aggregation,
  variables:
    ({
      dynamicGroup,
      extended,
      isQueryPerformance = undefined,
      mixed = false,
      modal,
      paths,
      root = false,
      useSelection = true,
    }) =>
    ({ get }) => {
      const dataset = get(selectors.datasetName);
      if (!dataset) return null;

      const useSidebarSampleId = !root && modal && !get(groupId) && !mixed;
      const sampleIds =
        useSidebarSampleId && useSelection ? [get(sidebarSampleId)] : [];

      if (useSidebarSampleId && sampleIds[0] === null) {
        return null;
      }

      mixed =
        (mixed || get(groupStatistics(modal)) === "group") && useSelection;

      const aggForm = {
        index: get(refresher),
        dataset,
        dynamicGroup,
        extendedStages: root ? {} : get(selectors.extendedStagesNoSort),
        filters:
          extended && !root
            ? get(modal ? filterAtoms.modalFilters : filterAtoms.filters)
            : null,
        groupId: !root && modal && useSelection ? get(groupId) || null : null,
        hiddenLabels: !root ? get(selectors.hiddenLabelsArray) : [],
        paths,
        mixed,
        sampleIds,
        slices: !useSelection
          ? get(groupSlice)
          : mixed
          ? get(groupSlices)
          : get(currentSlices(modal)),
        slice: get(groupSlice),
        view: !root ? get(viewAtoms.view) : [],
        queryPerformance:
          isQueryPerformance === undefined
            ? get(queryPerformance) && !modal
            : isQueryPerformance,
        hint: dynamicGroup ? null : get(activeIndex),
        maxQueryTime: get(queryPerformance) ? get(config).maxQueryTime : null,
      };

      return {
        form: aggForm,
      };
    },
});

// Collect every leaf value reachable along a dotted path, flattening any arrays
// encountered (e.g. a Detections list) so a single sample's labels can be tallied.
const collectLeafValues = (obj: unknown, segments: string[]): unknown[] => {
  if (obj === null || obj === undefined) {
    return [];
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((item) => collectLeafValues(item, segments));
  }
  if (segments.length === 0) {
    return [obj];
  }
  return collectLeafValues(
    (obj as Record<string, unknown>)[segments[0]],
    segments.slice(1)
  );
};

// compute one path's aggregation result for a single sample, matching the server's
// per-type result shapes so the modal sidebar can derive it from the cached sample JSON
const computeSampleAggregation = (
  ftype: string | undefined,
  subfield: string | undefined,
  path: string,
  sample: Record<string, unknown>
): Aggregation => {
  if (path === "" || path === "_") {
    return {
      __typename: "RootAggregation",
      path,
      count: 1,
      exists: 1,
      slice: 1,
      expandedFieldCount: 0,
      frameLabelFieldCount: 0,
    } as unknown as Aggregation;
  }

  const values = collectLeafValues(sample, path.split("."));
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const valueType = ftype === LIST_FIELD ? subfield : ftype;

  switch (valueType) {
    case INT_FIELD:
    case FRAME_NUMBER_FIELD: {
      const nums = nonNull.filter((v) => typeof v === "number") as number[];
      return {
        __typename: "IntAggregation",
        path,
        count: nums.length,
        exists: nums.length,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
      } as unknown as Aggregation;
    }
    case FLOAT_FIELD: {
      let inf = 0;
      let ninf = 0;
      let nan = 0;
      const finite: number[] = [];
      for (const v of nonNull) {
        if (v === "inf" || v === Infinity) inf++;
        else if (v === "-inf" || v === -Infinity) ninf++;
        else if (v === "nan" || (typeof v === "number" && Number.isNaN(v)))
          nan++;
        else if (typeof v === "number") finite.push(v);
      }
      const exists = finite.length + inf + ninf + nan;
      return {
        __typename: "FloatAggregation",
        path,
        count: exists,
        exists,
        min: finite.length ? Math.min(...finite) : null,
        max: finite.length ? Math.max(...finite) : null,
        inf,
        ninf,
        nan,
      } as unknown as Aggregation;
    }
    case BOOLEAN_FIELD: {
      let trueCount = 0;
      let falseCount = 0;
      for (const v of nonNull) {
        if (v === true) trueCount++;
        else if (v === false) falseCount++;
      }
      return {
        __typename: "BooleanAggregation",
        path,
        count: trueCount + falseCount,
        exists: trueCount + falseCount,
        true: trueCount,
        false: falseCount,
      } as unknown as Aggregation;
    }
    case STRING_FIELD:
    case OBJECT_ID_FIELD: {
      const tally = new Map<string, number>();
      for (const v of nonNull) {
        const key = String(v);
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      return {
        __typename: "StringAggregation",
        path,
        count: nonNull.length,
        exists: nonNull.length,
        values: [...tally.entries()].map(([value, count]) => ({
          value,
          count,
        })),
      } as unknown as Aggregation;
    }
    default:
      // embedded-document / label-list path — only the count is read
      return {
        __typename: "DataAggregation",
        path,
        count: values.length,
      } as unknown as Aggregation;
  }
};

/**
 * Modal sidebar aggregations computed client-side from the cached sample JSON,
 * so the modal never fires an `aggregationsQuery` (see {@link aggregations}).
 */
export const modalSampleAggregations = selectorFamily<
  Aggregation[],
  { paths: string[]; mixed?: boolean }
>({
  key: "modalSampleAggregations",
  get:
    (params) =>
    ({ get }) => {
      // null while playing/seeking an ImaVid — match the prior no-result behavior
      // (the sidebar settles on pause) without ever issuing a query.
      if (get(sidebarSampleId) === null) {
        return [];
      }

      const raw = get(activeModalSidebarSample) as
        | Record<string, unknown>
        | undefined;
      // `activeModalSidebarSample` yields the inner sample dict for ImaVid frames
      // but a wrapper elsewhere; normalize to the inner field dict either way.
      const sample = (raw?.sample as Record<string, unknown>) ?? raw;
      if (!sample) {
        return [];
      }

      return params.paths.map((path) => {
        const field = get(schemaAtoms.field(path));
        return computeSampleAggregation(
          field?.ftype,
          field?.subfield ?? undefined,
          path,
          sample
        );
      });
    },
});

export const aggregations = selectorFamily({
  key: "aggregations",
  get:
    (params: {
      extended: boolean;
      isQueryPerformance?: boolean;
      modal: boolean;
      paths: string[];
      mixed?: boolean;
    }) =>
    ({ get }) => {
      if (params) {
        // the modal sidebar is derivable from the cached sample JSON, so never query
        if (params.modal) {
          return get(
            modalSampleAggregations({
              paths: params.paths,
              mixed: params.mixed,
            })
          );
        }

        let extended = params.extended;
        if (extended && !get(filterAtoms.hasFilters(params.modal))) {
          extended = false;
        }

        return get(aggregationQuery({ ...params, extended })) ?? [];
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
      isQueryPerformance?: boolean;
      mixed?: boolean;
      modal: boolean;
      path: string;
    }) =>
    ({ get }) => {
      const paths = params.modal
        ? get(modalAggregationPaths({ path, mixed: params.mixed }))
        : get(schemaAtoms.filterFields(path));

      const result = get(
        aggregations({
          ...params,
          paths,
        })
      ).find((data) => data.path === path);

      if (result?.__typename === "AggregationQueryTimeout") {
        throw new AggregationQueryTimeout(result.queryTime);
      }

      return result;
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
