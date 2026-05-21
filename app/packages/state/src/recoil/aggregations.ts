import * as foq from "@fiftyone/relay";
import {
  BOOLEAN_FIELD,
  DATE_FIELD,
  DATE_TIME_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
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

      if (
        useSidebarSampleId &&
        sampleIds.length === 1 &&
        sampleIds[0] &&
        get(activeModalSidebarSample) &&
        paths.every((p) => !p.startsWith("frames."))
      ) {
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

const collectLeaves = (
  value: unknown,
  parts: string[],
  i: number
): unknown[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v) => collectLeaves(v, parts, i));
  }
  if (i >= parts.length) return [value];
  if (typeof value !== "object") return [];
  return collectLeaves(
    (value as Record<string, unknown>)[parts[i]],
    parts,
    i + 1
  );
};

const pickAggType = (ftype?: string, subfield?: string | null): string => {
  const t = ftype === LIST_FIELD && subfield ? subfield : ftype;
  switch (t) {
    case BOOLEAN_FIELD:
      return "BooleanAggregation";
    case INT_FIELD:
    case FRAME_NUMBER_FIELD:
      return "IntAggregation";
    case FLOAT_FIELD:
      return "FloatAggregation";
    case STRING_FIELD:
    case OBJECT_ID_FIELD:
    case DATE_FIELD:
    case DATE_TIME_FIELD:
      return "StringAggregation";
    case EMBEDDED_DOCUMENT_FIELD:
    case DYNAMIC_EMBEDDED_DOCUMENT_FIELD:
      return "DataAggregation";
    default:
      return "DataAggregation";
  }
};

export const deriveAggregation = (
  path: string,
  sample: Record<string, unknown>,
  fieldInfo: { ftype?: string; subfield?: string | null } | null
): Aggregation => {
  const parts = path.split(".");
  const leaves = collectLeaves(sample[parts[0]], parts, 1);
  const typename = pickAggType(fieldInfo?.ftype, fieldInfo?.subfield ?? null);

  switch (typename) {
    case "BooleanAggregation": {
      let count = 0;
      let trueN = 0;
      let falseN = 0;
      for (const v of leaves) {
        if (typeof v === "boolean") {
          count++;
          if (v) trueN++;
          else falseN++;
        }
      }
      return {
        __typename: "BooleanAggregation",
        path,
        count,
        exists: count,
        true: trueN,
        false: falseN,
      } as unknown as Aggregation;
    }
    case "IntAggregation": {
      let count = 0;
      let min: number | null = null;
      let max: number | null = null;
      for (const v of leaves) {
        if (typeof v === "number" && Number.isFinite(v)) {
          count++;
          if (min === null || v < min) min = v;
          if (max === null || v > max) max = v;
        }
      }
      return {
        __typename: "IntAggregation",
        path,
        count,
        exists: count,
        min,
        max,
      } as unknown as Aggregation;
    }
    case "FloatAggregation": {
      let count = 0;
      let inf = 0;
      let ninf = 0;
      let nan = 0;
      let min: number | null = null;
      let max: number | null = null;
      for (const v of leaves) {
        if (typeof v !== "number") continue;
        count++;
        if (Number.isNaN(v)) nan++;
        else if (v === Infinity) inf++;
        else if (v === -Infinity) ninf++;
        else {
          if (min === null || v < min) min = v;
          if (max === null || v > max) max = v;
        }
      }
      return {
        __typename: "FloatAggregation",
        path,
        count,
        exists: count,
        inf,
        ninf,
        nan,
        min,
        max,
      } as unknown as Aggregation;
    }
    case "StringAggregation": {
      const counts = new Map<string, number>();
      let count = 0;
      for (const v of leaves) {
        if (typeof v === "string") {
          count++;
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      return {
        __typename: "StringAggregation",
        path,
        count,
        exists: count,
        values: Array.from(counts.entries()).map(([value, c]) => ({
          count: c,
          value,
        })),
      } as unknown as Aggregation;
    }
    default: {
      let cur: unknown = sample;
      for (const part of parts) {
        if (cur === null || cur === undefined) {
          cur = undefined;
          break;
        }
        if (Array.isArray(cur)) {
          cur = cur.flatMap((x) =>
            x &&
            typeof x === "object" &&
            (x as Record<string, unknown>)[part] !== undefined
              ? [(x as Record<string, unknown>)[part]]
              : []
          );
        } else if (typeof cur === "object") {
          cur = (cur as Record<string, unknown>)[part];
        } else {
          cur = undefined;
          break;
        }
      }
      let count = 0;
      if (cur !== null && cur !== undefined) {
        if (Array.isArray(cur)) count = cur.length;
        else count = 1;
      }
      return {
        __typename: "DataAggregation",
        path,
        count,
      } as unknown as Aggregation;
    }
  }
};

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
        let extended = params.extended;
        if (extended && !get(filterAtoms.hasFilters(params.modal))) {
          extended = false;
        }

        const useSidebarSampleId =
          params.modal && !get(groupId) && !params.mixed;
        if (
          useSidebarSampleId &&
          params.paths.every((p) => !p.startsWith("frames."))
        ) {
          const sid = get(sidebarSampleId);
          const sampleDoc = sid ? get(activeModalSidebarSample) : null;
          if (sampleDoc) {
            return params.paths.map((path) =>
              deriveAggregation(
                path,
                sampleDoc as unknown as Record<string, unknown>,
                get(schemaAtoms.field(path))
              )
            );
          }
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
