import * as fos from "@fiftyone/state";
import {
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  EMBEDDED_DOCUMENT_FIELD,
  LIST_FIELD,
} from "@fiftyone/utilities";
import { DefaultValue, atom, atomFamily, selector } from "recoil";
import { disabledField, skipField } from "../hooks/useSchemaSettings.utils";

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

export const affectedPathCountState = atom({
  key: "affectedPathCountState",
  default: 0,
});

export const searchMetaFilterState = atom({
  key: "searchMetaFilterState",
  default: {},
});

export const lastAppliedPathsState = atom({
  key: "lastAppliedExcludedPathsState",
  default: {
    excluded: [],
    selected: [],
  },
});

// tracks action and value - currently used for (un)select all action
export const lastActionToggleSelectionState = atom<Record<
  string,
  boolean
> | null>({
  key: "lastActionToggleSelectionState",
  default: null,
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

export const selectedPathsState = atomFamily({
  key: "selectedPathsState",
  default: (param: {}) => param,
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPathsMap) => {
        const dataset = await getPromise(fos.dataset);
        const viewSchema = await getPromise(viewSchemaState);
        const fieldSchema = await getPromise(fieldSchemaState);
        const combinedSchema = { ...fieldSchema, ...viewSchema };
        const isImage = dataset.mediaType === "image";
        const isVideo = dataset.mediaType === "video";

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

        const newPaths = newPathsMap?.[dataset?.name] || [];
        const greenPaths = [...newPaths]
          .filter((path) => {
            const skip = skipField(path, combinedSchema);
            return !!path && !skip;
          })
          .map((path) => mapping?.[path] || path);

        setSelf({
          [dataset?.name]: new Set(greenPaths),
        });
      });
    },
  ],
});

export const excludedPathsState = atomFamily({
  key: "excludedPathsState",
  default: (param: {}) => param,
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
        const isVideo = dataset.mediaType === "video";
        const isImage = dataset.mediaType === "image";
        const isInSearchMode = !!searchResults?.length;

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

        const newPaths = newPathsMap?.[dataset?.name] || [];
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
                isPatchesView
              )
            );
          })
          .map((path) => mapping?.[path] || path);

        // if top level only, count should be top-level too
        // if nested fields are shown, exclude more granular
        let finalGreenPaths = greenPaths;
        if (!showNestedField && !isInSearchMode) {
          finalGreenPaths = greenPaths.filter((path) =>
            isVideo
              ? (path.split(".").length === 2 && path.startsWith("frames.")) ||
                !path.includes(".")
              : !path.includes(".")
          );
        }

        const shouldFilterTopLevelFields = showNestedField || isInSearchMode;
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

              const isTopLevelPath = isVideo
                ? !(
                    path.split(".").length === 2 && path.startsWith("frames.")
                  ) || !path.includes(".")
                : !path.includes(".");

              return !(
                isEmbeddedOrListType &&
                hasDynamicEmbeddedDocument &&
                isTopLevelPath
              );
            })
          : finalGreenPaths;

        // filter out subpaths if a parent (or higher) path is also in the list
        const finalGreenPathsSet = new Set(finalGreenPaths);
        if (showNestedField) {
          finalGreenPaths = finalGreenPaths.filter((path) => {
            let tmp = path;
            while (tmp.indexOf(".") > 0) {
              const parentPath = tmp.substring(0, tmp.lastIndexOf("."));
              if (finalGreenPathsSet.has(parentPath) || path === parentPath) {
                return false;
              }
              tmp = parentPath;
            }
            return true;
          });
        }

        setSelf({
          [dataset.name]: new Set(finalGreenPaths),
        });
      });
    },
  ],
});

export const selectedFieldsStageState = atom<any>({
  key: "selectedFieldsStageState",
  default: undefined,
  effects: [
    ({ onSet }) => {
      onSet((value) => {
        const context = fos.getContext();
        if (context.loaded) {
          context.history.replace(
            `${context.history.location.pathname}${context.history.location.search}`,
            {
              ...context.history.location.state,
              selectedFieldsStage: value || null,
            }
          );
        }
      });
    },
  ],
});
