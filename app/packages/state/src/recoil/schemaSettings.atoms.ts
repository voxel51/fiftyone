import * as fos from "@fiftyone/state";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
} from "@fiftyone/utilities";
import {
  DefaultValue,
  atom,
  atomFamily,
  selector,
  selectorFamily,
} from "recoil";
import { disabledField, skipField } from "../hooks/useSchemaSettings.utils";
// Lazy-cycle with ./selectors: only dereferenced inside selector gets.
import { datasetName as datasetNameSelector } from "./selectors";
import { sessionAtom } from "../session";

export const TAB_OPTIONS_MAP = {
  SELECTION: "Selection",
  FILTER_RULE: "Filter rule",
};

export const TAB_OPTIONS = Object.values(TAB_OPTIONS_MAP);

export const schemaSearchTerm = atom<string>({
  key: "schemaSearchTerm",
  default: "",
});

export const showNestedFieldsState = atom<boolean>({
  key: "showNestedFieldsState",
  default: false,
});

export const schemaSelectedSettingsTab = atom<string>({
  key: "schemaSelectedSettingsTab",
  default: TAB_OPTIONS_MAP.SELECTION,
});

export const settingsModal = atom<{ open: boolean } | null>({
  key: "settingsModal",
  default: {
    open: false,
  },
});

export const allFieldsCheckedState = atom<boolean>({
  key: "allFieldsCheckedState",
  default: true,
});

export const expandedPathsState = atom<{} | null>({
  key: "expandedPathsState",
  default: null,
});

export const viewSchemaState = atom({
  key: "viewSchemaState",
  default: null,
});

export const fieldSchemaState = atom({
  key: "fieldSchemaState",
  default: null,
});

export const showMetadataState = atom({
  key: "showMetadataState",
  default: false,
});

export const includeNestedFieldsState = atom({
  key: "includeNestedFieldsState",
  default: true,
});

export const searchMetaFilterState = atom({
  key: "searchMetaFilterState",
  default: {},
});

const getRawPath = (path: string) =>
  path.startsWith("frames.") ? path.replace("frames.", "") : path;

export const schemaSearchResultList = selector<string[]>({
  key: "schemaSearchResultsSelector",
  get: ({ get }) => get(schemaSearchResults),
  set: ({ set, get }, newPaths) => {
    if (newPaths instanceof DefaultValue) {
      newPaths = [];
    }
    const viewSchema = get(viewSchemaState);
    const fieldSchema = get(fieldSchemaState);
    const combinedSchema = { ...fieldSchema, ...viewSchema };

    const greenPaths = [...newPaths]
      .filter((path) => {
        const cleanPath = getRawPath(path);

        return (
          cleanPath &&
          combinedSchema?.[cleanPath]?.ftype &&
          !skipField(cleanPath, combinedSchema)
        );
      })
      .map((path) => getRawPath(path));
    set(schemaSearchResults, greenPaths);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const schemaSearchResults = atom<string[]>({
  key: "schemaSearchResults",
  default: [],
});

const isTopLevelField = (isVideo: boolean, path: string) => {
  return isVideo
    ? (path.split(".").length === 2 && path.startsWith("frames.")) ||
        !path.includes(".")
    : !path.includes(".");
};

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
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPathsMap) => {
        const viewSchema = await getPromise(fos.viewSchemaState);
        const fieldSchema = await getPromise(fos.fieldSchemaState);
        const dataset = await getPromise(fos.dataset);
        const showNestedField = await getPromise(fos.showNestedFieldsState);
        const searchResults = await getPromise(fos.schemaSearchResults);
        const isFrameView = await getPromise(fos.isFramesView);
        const isClipsView = await getPromise(fos.isClipsView);
        const isPatchesView = await getPromise(fos.isPatchesView);
        const mediaType = await getPromise(fos.mediaType);
        const isImage = mediaType === "image";
        const isVideo = mediaType === "video";
        const isInSearchMode = !!searchResults?.length;
        const includeNestedFields = await getPromise(
          fos.includeNestedFieldsState,
        );

        if (!dataset) {
          return;
        }

        const combinedSchema = { ...fieldSchema, ...viewSchema };
        const mapping = {};
        Object.keys(combinedSchema).forEach((path) => {
          if (isImage) {
            mapping[path] = path;
          }
          if (isVideo && viewSchema) {
            Object.keys(viewSchema).forEach((path) => {
              mapping[path] = `frames.${path}`;
            });
          }
        });

        const newPaths = newPathsMap?.[dataset.name] || [];
        const greenPaths = [...newPaths]
          .filter((path) => {
            const rawPath = path.replace("frames.", "");
            return (
              !!rawPath &&
              !skipField(rawPath, combinedSchema) &&
              !disabledField(
                path,
                combinedSchema,
                dataset?.groupField,
                isFrameView,
                isClipsView,
                isVideo,
                isPatchesView,
              )
            );
          })
          .map((path) => mapping?.[path] || path);

        // if top level only, count should be top-level too
        // if nested fields are shown, exclude more granular
        let finalGreenPaths = greenPaths;
        if (!showNestedField && !isInSearchMode) {
          finalGreenPaths = greenPaths.filter((path) =>
            isTopLevelField(isVideo, path),
          );
        }

        const shouldFilterTopLevelFields = !showNestedField || isInSearchMode;
        finalGreenPaths = shouldFilterTopLevelFields
          ? finalGreenPaths.filter((path) => {
              const isEmbeddedOrListType = [
                EMBEDDED_DOCUMENT_FIELD,
                LIST_FIELD,
              ].includes(combinedSchema[path]?.ftype);

              // embedded document could break an exclude_field() call causing mongo query issue.
              const hasDynamicEmbeddedDocument = [
                DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
              ].includes(combinedSchema[path]?.embeddedDocType);

              return !(isEmbeddedOrListType && hasDynamicEmbeddedDocument);
            })
          : finalGreenPaths;

        if (isInSearchMode && !includeNestedFields) {
          finalGreenPaths = finalGreenPaths.filter((path: string) =>
            isTopLevelField(isVideo, path),
          );
        }

        setSelf({
          [dataset.name]: new Set(finalGreenPaths),
        });
      });
    },
  ],
});

export const excludedPathsStrippedState = selector({
  key: "excludedPathsStrippedState",
  get: ({ get }) => {
    const datasetName = get(fos.datasetName);
    const showNestedFields = get(fos.showNestedFieldsState);
    const fields = get(excludedPathsState({}));
    if (!datasetName || !fields[datasetName]) {
      return [];
    }

    let finalGreenPaths = [...fields[datasetName]];

    if (showNestedFields) {
      finalGreenPaths = finalGreenPaths.filter((path) => {
        let tmp = path;
        while (tmp.indexOf(".") > 0) {
          const parentPath = tmp.substring(0, tmp.lastIndexOf("."));
          if (fields[datasetName].has(parentPath) || path === parentPath) {
            return false;
          }
          tmp = parentPath;
        }
        return true;
      });
    }

    return finalGreenPaths;
  },
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

export const schemaLens = atom<SchemaLensValue | null>({
  key: "schemaLens",
  default: null,
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
 * The wire exclusions the CLIENT must carry on grid / aggregation
 * queries (`fieldExclusionStage`). When the server already enforces
 * the task's schema, sending the task's stage again only adds a
 * per-document projection to every full scan (8–16% on the label
 * histogram at 300k samples), so enforced viewers carry just the
 * Explore lens (which the server never applies); exempt viewers keep
 * the full union.
 */
export const activeSchemaStageExclusions = selector<string[] | null>({
  key: "activeSchemaStageExclusions",
  get: ({ get }) => {
    if (!get(taskExclusionsEnforcedByServer)) {
      return get(activeSchemaWireExclusions);
    }
    const lens = lensContribution(
      get(schemaLens),
      get(taskSchemaGoverns),
      get(datasetNameSelector),
    );
    const paths = [...(lens?.excluded ?? []), ...(lens?.excludedAttrDb ?? [])];
    return paths.length ? [...new Set(paths)].sort() : null;
  },
});

/**
 * The active wire exclusions as serialized VIEW stages — for
 * per-sample queries (the modal's sample fetch) that do not ride the
 * page query's ``$extendedView`` channel. Appending the stage keeps
 * hidden fields out of those payloads too; empty when no schema
 * governs.
 */
export const activeSchemaExclusionStages = selector<
  { _cls: string; kwargs: [string, unknown][] }[]
>({
  key: "activeSchemaExclusionStages",
  get: ({ get }) => {
    const excluded = get(activeSchemaWireExclusions);
    if (!excluded?.length) {
      return [];
    }
    return [
      {
        _cls: "fiftyone.core.stages.ExcludeFields",
        kwargs: [
          ["field_names", excluded],
          ["_allow_missing", true],
        ],
      },
    ];
  },
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
 * Identity of the schema currently governing Explore fetches — the
 * page-query reload is keyed on THIS (not just the exclusion list), so
 * switching schemas always refetches even when two schemas hide the
 * same fields. Stable ("task") inside workflow tasks.
 */
export const activeSchemaLensKey = selector<string>({
  key: "activeSchemaLensKey",
  get: ({ get }) => {
    if (get(taskSchemaGoverns)) {
      return "task";
    }
    const lens = lensContribution(
      get(schemaLens),
      false,
      get(datasetNameSelector),
    );
    return lens?.docId ?? "";
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
