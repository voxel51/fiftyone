import * as fos from "@fiftyone/state";
import { atom, atomFamily, selector, selectorFamily } from "recoil";
// Lazy-cycle with ./selectors: only dereferenced inside selector gets.
import { datasetName as datasetNameSelector } from "./selectors";
import { sessionAtom } from "../session";

export const excludedPathsState = atomFamily({
  key: "excludedPathsState",
  default: selectorFamily({
    key: "excludedPathsStateDefault",
    get:
      () =>
      ({ get }) => {
        const dataset = get(fos.dataset);
        const fvStage = get(fieldVisibilityStage);

        if (dataset) {
          return {
            [dataset?.name]: fvStage
              ? new Set(fvStage.kwargs?.field_names)
              : new Set(),
          };
        }
        return null;
      },
  }),
});

export const fieldVisibilityStage = sessionAtom({
  key: "fieldVisibilityStage",
  default: null,
});

/**
 * Field paths hidden by the active workflow task's stage schema policy
 * (written by the task workspace on entry, cleared on exit). A silent,
 * in-memory sibling of `fieldVisibilityStage`: it rides the same
 * enforcement paths — client-side `fieldSchema` filtering plus the
 * `extendedStages` ExcludeFields sent with server queries — but never
 * renders a view-bar stage or a clearable pill, is not persisted to
 * the server session, and cannot be cleared by sidebar affordances.
 */
export const taskFieldExclusions = atom<string[] | null>({
  key: "taskFieldExclusions",
  default: null,
});

/**
 * The admin Explore "schema lens": a named label-schema doc selected in
 * the grid sidebar to view the dataset through. `excluded` is the doc's
 * resolved `excluded_paths` (server-resolved, so lens semantics match
 * task semantics). Scoped to `dataset` — a lens never leaks across
 * datasets. Session-local.
 */
export interface SchemaLensValue {
  dataset: string;
  docId: string;
  name: string;
  excluded: string[];
  excludedAttrs?: string[];
  /** Embedded DB paths of hidden attributes (payload stripping). */
  excludedAttrDb?: string[];
}

const SCHEMA_LENS_STORAGE_KEY = "fiftyone.schemaLens";

/**
 * Remembers the chosen lens across page reloads in this browser. The
 * stored value carries its dataset, so another dataset ignores it, and
 * the lens selector re-derives the hidden paths from the schema doc on
 * load, so an edited schema never serves a stale list.
 */
const persistSchemaLens = ({
  setSelf,
  onSet,
}: {
  setSelf: (value: SchemaLensValue | null) => void;
  onSet: (
    handler: (
      value: SchemaLensValue | null,
      old: unknown,
      reset: boolean,
    ) => void,
  ) => void;
}) => {
  try {
    const raw = globalThis.localStorage?.getItem(SCHEMA_LENS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SchemaLensValue;
      if (parsed && typeof parsed.docId === "string" && parsed.dataset) {
        setSelf(parsed);
      }
    }
  } catch {
    // storage unavailable or unreadable: start without a lens
  }
  onSet((value, _old, reset) => {
    try {
      if (reset || !value) {
        globalThis.localStorage?.removeItem(SCHEMA_LENS_STORAGE_KEY);
      } else {
        globalThis.localStorage?.setItem(
          SCHEMA_LENS_STORAGE_KEY,
          JSON.stringify(value),
        );
      }
    } catch {
      // storage unavailable: the lens still applies for this session
    }
  });
};

export const schemaLens = atom<SchemaLensValue | null>({
  key: "schemaLens",
  default: null,
  effects: [persistSchemaLens],
});

/**
 * True while a workflow task is active: the task's schema (or its
 * absence — an unrestricted task) governs, and no Explore lens or
 * dataset default may contribute exclusions.
 */
export const taskSchemaGoverns = atom<boolean>({
  key: "taskSchemaGoverns",
  default: false,
});

const lensContribution = (
  lens: SchemaLensValue | null,
  governs: boolean,
  dataset: string | null,
): SchemaLensValue | null => {
  if (governs) {
    return null;
  }
  return lens && lens.dataset === dataset ? lens : null;
};

/**
 * Attribute-level exclusions from the active workflow task's schema
 * policy (`<field_path>.<attr>` entries) — hidden attributes drop out
 * of the Explore sidebar's nested rows/filters via `fieldPaths`.
 */
export const taskAttributeExclusions = atom<string[] | null>({
  key: "taskAttributeExclusions",
  default: null,
});

/**
 * Embedded DB paths (`<field>.<list_key>.<attr>`) of the active task's
 * hidden attributes — these ride the server exclusion stages so hidden
 * attribute VALUES are stripped from sample payloads.
 */
export const taskAttrDbExclusions = atom<string[] | null>({
  key: "taskAttrDbExclusions",
  default: null,
});

/**
 * Everything the server exclusion stages should carry: hidden FIELDS
 * plus hidden-attribute DB paths. Field-schema consumers keep reading
 * `activeSchemaExclusions` (top-level only); this wire union feeds
 * `fieldExclusionStage` and the `$extendedView` page-query reload.
 */
export const activeSchemaWireExclusions = selector<string[] | null>({
  key: "activeSchemaWireExclusions",
  get: ({ get }) => {
    const fields = get(activeSchemaExclusions);
    const taskDb = get(taskAttrDbExclusions);
    const lens = lensContribution(
      get(schemaLens),
      get(taskSchemaGoverns),
      get(datasetNameSelector),
    );
    const lensDb = lens?.excludedAttrDb ?? null;
    if (!fields?.length && !taskDb?.length && !lensDb?.length) {
      return null;
    }
    return [
      ...new Set([...(fields ?? []), ...(taskDb ?? []), ...(lensDb ?? [])]),
    ].sort();
  },
});

const sortedUnion = (...lists: (readonly string[] | null | undefined)[]) => {
  const paths = new Set(lists.flatMap((list) => list ?? []));
  return paths.size ? [...paths].sort() : null;
};

/**
 * The active task's hidden fields and attribute DB paths. These ride the
 * server queries (the page query's `$extendedView`, the grid and
 * aggregation stages, the modal sample query), because a task's viewer
 * may not be allowed to see them.
 */
export const taskSchemaWireExclusions = selector<string[] | null>({
  key: "taskSchemaWireExclusions",
  get: ({ get }) =>
    sortedUnion(get(taskFieldExclusions), get(taskAttrDbExclusions)),
});

/**
 * The fields and attribute DB paths the Explore schema lens hides. Only
 * viewers who may see every field can pick a lens (never in a task), so
 * these are hidden in the client: switching the lens never reloads the
 * page query or refetches the grid's or the modal's samples.
 */
export const lensWireExclusions = selector<string[] | null>({
  key: "lensWireExclusions",
  get: ({ get }) => {
    const lens = lensContribution(
      get(schemaLens),
      get(taskSchemaGoverns),
      get(datasetNameSelector),
    );
    return sortedUnion(lens?.excluded, lens?.excludedAttrDb);
  },
});

/**
 * The `ExcludeFields` view stage for the given paths, as a list of
 * serialized stages (empty when there are none).
 */
export const exclusionViewStages = (paths: readonly string[] | null) =>
  paths?.length
    ? [
        {
          _cls: "fiftyone.core.stages.ExcludeFields",
          kwargs: [
            ["field_names", [...paths]],
            ["_allow_missing", true],
          ] as [string, unknown][],
        },
      ]
    : [];

/**
 * Whether the server is enforcing the active task's schema for this
 * viewer (set by the task entry effect alongside the task header:
 * below MANAGE the server drops hidden paths from aggregation requests
 * and appends the exclusion stage to the page query itself; MANAGE
 * viewers and admins are exempt and rely on the client stage).
 */
export const taskExclusionsEnforcedByServer = atom<boolean>({
  key: "taskExclusionsEnforcedByServer",
  default: false,
});

/**
 * The wire exclusions the CLIENT must carry on aggregation queries
 * (`fieldExclusionStage`). When the server already enforces the task's
 * schema, sending the task's stage again only adds a per-document
 * projection to every full scan (8–16% on the label histogram at 300k
 * samples), so enforced viewers carry just the Explore lens (which the
 * server never applies); exempt viewers keep the full union.
 */
export const activeSchemaStageExclusions = selector<string[] | null>({
  key: "activeSchemaStageExclusions",
  get: ({ get }) =>
    get(taskExclusionsEnforcedByServer)
      ? get(lensWireExclusions)
      : get(activeSchemaWireExclusions),
});

/**
 * Like `activeSchemaStageExclusions`, without the Explore lens: what the
 * grid's sample query carries. The grid fetches lens-hidden fields and
 * leaves them out of what it draws, so a lens switch keeps its samples,
 * media and scroll position.
 */
export const taskSchemaStageExclusions = selector<string[] | null>({
  key: "taskSchemaStageExclusions",
  get: ({ get }) =>
    get(taskExclusionsEnforcedByServer) ? null : get(taskSchemaWireExclusions),
});

/** Union of the attribute-exclusion channels (task + Explore lens). */
export const activeSchemaAttrExclusions = selector<string[] | null>({
  key: "activeSchemaAttrExclusions",
  get: ({ get }) => {
    const task = get(taskAttributeExclusions);
    const lens = lensContribution(
      get(schemaLens),
      get(taskSchemaGoverns),
      get(datasetNameSelector),
    );
    const lensExcluded = lens?.excludedAttrs ?? null;
    if (!task?.length && !lensExcluded?.length) {
      return null;
    }
    return [...new Set([...(task ?? []), ...(lensExcluded ?? [])])].sort();
  },
});

/**
 * The union of every schema-policy exclusion channel — the active
 * workflow task's hidden fields and the admin Explore lens (when it
 * targets the current dataset). THE read for exclusion consumers
 * (`fieldSchema`, `labelFields`, `fieldPaths`, `fieldExclusionStage`,
 * the page-query reload): individual channels are write-side details.
 */
export const activeSchemaExclusions = selector<string[] | null>({
  key: "activeSchemaExclusions",
  get: ({ get }) => {
    const task = get(taskFieldExclusions);
    const lens = lensContribution(
      get(schemaLens),
      get(taskSchemaGoverns),
      get(datasetNameSelector),
    );
    const lensExcluded = lens?.excluded ?? null;
    if (!task?.length && !lensExcluded?.length) {
      return null;
    }
    return [...new Set([...(task ?? []), ...(lensExcluded ?? [])])].sort();
  },
});

export const isFieldVisibilityActive = selector({
  key: "isClearFieldVisibilityVisible",
  get: ({ get }) => {
    const affectedCount =
      get(fieldVisibilityStage)?.kwargs?.field_names?.length || 0;

    return affectedCount > 0;
  },
});
