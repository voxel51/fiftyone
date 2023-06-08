import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { buildSchema } from "@fiftyone/state";
import {
  CLASSIFICATIONS_FIELD,
  CLASSIFICATION_FIELD,
  DETECTIONS_FIELD,
  DETECTION_FIELD,
  DETECTION_FILED,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
  DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
  EMBEDDED_DOCUMENT_FIELD,
  FRAME_SUPPORT_FIELD,
  Field,
  GEO_LOCATIONS_FIELD,
  GEO_LOCATION_FIELD,
  HEATMAP_FIELD,
  KEYPOINT_FILED,
  LIST_FIELD,
  POLYLINES_FIELD,
  POLYLINE_FIELD,
  REGRESSION_FILED,
  RESERVED_FIELD_KEYS,
  SEGMENTATION_FIELD,
  Schema,
  TEMPORAL_DETECTION_FIELD,
  UNSUPPORTED_FILTER_TYPES,
  VALID_LABEL_TYPES,
  VECTOR_FIELD,
} from "@fiftyone/utilities";
import {
  FRAME_NUMBER_FIELD,
  JUST_FIELD,
  OBJECT_ID_FIELD,
} from "@fiftyone/utilities";
import { isEmpty, keyBy } from "lodash";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { useMutation, useRefetchableFragment } from "react-relay";
import {
  atom,
  atomFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";

export const TAB_OPTIONS_MAP = {
  SELECTION: "Selection",
  FILTER_RULE: "Filter rule",
};

export const TAB_OPTIONS = Object.values(TAB_OPTIONS_MAP);
const SELECT_ALL = "SELECT_ALL";

const skipField = (path: string, ftype: string, schema: {}) => {
  const parentPath = path.substring(0, path.lastIndexOf("."));

  return (
    UNSUPPORTED_FILTER_TYPES.includes(ftype) ||
    ftype === JUST_FIELD ||
    (parentPath &&
      schema[parentPath]?.embeddedDocType === DETECTION_FILED &&
      path.endsWith(".bounding_box")) ||
    path.endsWith(".index")
  );
};

export const disabledField = (
  path: string,
  combinedSchema: Record<string, Field>,
  groupField?: string
): boolean => {
  const currField = combinedSchema?.[path] || ({} as Field);
  const { ftype, embeddedDocType } = currField;
  const parentPath = path.substring(0, path.lastIndexOf("."));
  const parentField = combinedSchema?.[parentPath];
  const parentEmbeddedDocType = parentField?.embeddedDocType;
  const pathSplit = path.split(".");
  const embeddedDocTypeSplit = embeddedDocType?.split(".");
  const hasDynamicEmbeddedDocument = [
    DYNAMIC_EMBEDDED_DOCUMENT_FIELD,
    DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
  ].includes(embeddedDocType);

  return (
    [
      OBJECT_ID_FIELD,
      FRAME_NUMBER_FIELD,
      FRAME_SUPPORT_FIELD,
      VECTOR_FIELD,
    ].includes(ftype) ||
    [path, parentPath].includes(groupField) ||
    RESERVED_FIELD_KEYS.includes(path) ||
    path.startsWith("metadata") ||
    ([
      TEMPORAL_DETECTION_FIELD,
      DETECTION_FIELD,
      DETECTIONS_FIELD,
      CLASSIFICATION_FIELD,
      CLASSIFICATIONS_FIELD,
      KEYPOINT_FILED,
      REGRESSION_FILED,
      HEATMAP_FIELD,
      SEGMENTATION_FIELD,
      GEO_LOCATIONS_FIELD,
      GEO_LOCATION_FIELD,
      POLYLINE_FIELD,
      POLYLINES_FIELD,
    ].includes(parentEmbeddedDocType) &&
      [
        "id",
        "tags",
        "label",
        "bounding_box",
        "mask",
        "confidence",
        "index",
        "points",
        "closed",
        "filled",
        "logits",
        "mask_path",
        "map",
        "map_path",
        "Range",
        "Confidence",
        "support",
        "point",
        "line",
        "Polygon",
        "points",
        "polygons",
      ].includes(pathSplit[pathSplit.length - 1])) ||
    [
      TEMPORAL_DETECTION_FIELD,
      DETECTION_FIELD,
      DETECTIONS_FIELD,
      CLASSIFICATION_FIELD,
      CLASSIFICATIONS_FIELD,
      KEYPOINT_FILED,
      REGRESSION_FILED,
      HEATMAP_FIELD,
      SEGMENTATION_FIELD,
      GEO_LOCATIONS_FIELD,
      GEO_LOCATION_FIELD,
      POLYLINE_FIELD,
      POLYLINES_FIELD,
    ].includes(ftype) ||
    (parentPath &&
      parentPath !== path &&
      ftype === LIST_FIELD &&
      (hasDynamicEmbeddedDocument ||
        VALID_LABEL_TYPES.includes(
          embeddedDocType?.includes(".")
            ? embeddedDocTypeSplit[embeddedDocTypeSplit.length - 1]
            : embeddedDocType
        )))
  );
};

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

export const schemaSearchRestuls = atom<string[]>({
  key: "schemaSearchRestuls",
  default: [],
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPaths = []) => {
        const viewSchema = await getPromise(viewSchemaState);
        const fieldSchema = await getPromise(fieldSchemaState);
        const combinedSchema = { ...fieldSchema, ...viewSchema };

        const greenPaths = [...newPaths]
          .filter(
            (path) =>
              path &&
              combinedSchema?.[
                path.startsWith("frames.") ? path.replace("frames.", "") : path
              ]?.ftype &&
              !skipField(path, combinedSchema?.[path]?.ftype, combinedSchema)
          )
          .map((path) =>
            path.startsWith("frames.") ? path.replace("frames.", "") : path
          );

        setSelf(greenPaths);
      });
    },
  ],
});

// tracks action and value - currently used for (un)select all action
export const lastActionToggleSelectionState = atom<Record<
  string,
  boolean
> | null>({
  key: "lastActionToggleSelectionState",
  default: null,
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
            const skip = skipField(
              path,
              viewSchema?.[path]?.ftype ||
                viewSchema?.[path.replace("frames.", "")]?.ftype ||
                fieldSchema?.[path]?.ftype,
              combinedSchema
            );
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
        const viewSchema = await getPromise(viewSchemaState);
        const fieldSchema = await getPromise(fieldSchemaState);
        const dataset = await getPromise(fos.dataset);
        const showNestedField = await getPromise(showNestedFieldsState);
        const searchResults = await getPromise(schemaSearchRestuls);
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
              !skipField(
                rawPath,
                combinedSchema?.[rawPath]?.ftype,
                combinedSchema
              ) &&
              !disabledField(path, combinedSchema, dataset?.groupField)
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
                DYNAMIC_EMBEDDED_DOCUMENT_FIELD_V2,
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
export const schemaState = atom<Schema>({
  key: "schemaState",
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

export default function useSchemaSettings() {
  const [settingModal, setSettingsModal] = useRecoilState(settingsModal);
  const [showMetadata, setShowMetadata] = useRecoilState(showMetadataState);
  const router = useContext(fos.RouterContext);
  const [setView] = useMutation<foq.setViewMutation>(foq.setView);
  const dataset = useRecoilValue(fos.dataset);
  const isGroupDataset = dataset?.groupField;

  const resetTextFilter = useResetRecoilState(fos.textFilter(false));
  const datasetName = useRecoilValue(fos.datasetName);

  const resetSelectedPaths = useResetRecoilState(selectedPathsState({}));

  const setSelectedFieldsStage = useRecoilCallback(
    ({ snapshot, set }) =>
      async (value) => {
        if (!dataset) {
          return;
        }

        set(selectedFieldsStageState, value);

        // router is loaded only in OSS
        if (router.loaded) return;
        const view = await snapshot.getPromise(fos.view);
        const subscription = await snapshot.getPromise(fos.stateSubscription);
        setView({
          variables: {
            view: value ? [...view, value] : view,
            datasetName: dataset.name,
            form: {},
            subscription,
          },
          onCompleted: ({ setView: { dataset } }) => {
            // in an embedded context, we update the dataset schema through the
            // state proxy
            set(fos.stateProxy, (current) => ({
              ...(current || {}),
              dataset,
            }));
          },
        });
      },
    [setView, router, dataset]
  );

  const setViewSchema = useSetRecoilState(viewSchemaState);
  const setFieldSchema = useSetRecoilState(fieldSchemaState);
  const [searchTerm, setSearchTerm] = useRecoilState<string>(schemaSearchTerm);
  const [searchResults, setSearchResults] = useRecoilState(schemaSearchRestuls);
  const isVideo = dataset.mediaType === "video";

  const setSchema = useSetRecoilState(schemaState);
  useEffect(() => {
    if (datasetName) {
      setSchema(dataset ? buildSchema(dataset, true) : null);
    }
  }, [datasetName]);

  const [allFieldsChecked, setAllFieldsChecked] = useRecoilState(
    allFieldsCheckedState
  );

  const [includeNestedFields, setIncludeNestedFieldsRaw] = useRecoilState(
    includeNestedFieldsState
  );

  const [affectedPathCount, setAffectedPathCount] = useRecoilState(
    affectedPathCountState
  );

  const [lastAppliedPaths, setLastAppliedPaths] = useRecoilState(
    lastAppliedPathsState
  );

  const [showNestedFields, setShowNestedFieldsRaw] = useRecoilState<boolean>(
    showNestedFieldsState
  );

  const [searchMetaFilter, setSearchMetaFilter] = useRecoilState(
    searchMetaFilterState
  );

  const [expandedPaths, setExpandedPaths] = useRecoilState(expandedPathsState);

  const [lastActionToggleSelection, setLastActionToggleSelection] =
    useRecoilState(lastActionToggleSelectionState);

  const vStages = useRecoilValue(fos.view);
  const [data, refetch] = useRefetchableFragment<
    foq.viewSchemaFragmentQuery,
    foq.viewSchemaFragmentQuery$data
  >(foq.viewSchema, null);

  useEffect(() => {
    if (datasetName && vStages) {
      refetch(
        { name: datasetName, viewStages: vStages || [] },
        {
          fetchPolicy: "store-and-network",
          onComplete: (err) => {
            if (err) {
              console.error("failed to fetch view schema", err);
            }
          },
        }
      );
    }
  }, [vStages, datasetName]);

  const { fieldSchema: fieldSchemaRaw, frameFieldSchema } =
    data?.schemaForViewStages || {};

  const viewSchema = keyBy(frameFieldSchema, "path");
  const fieldSchema = keyBy(fieldSchemaRaw, "path");
  const combinedSchema = { ...viewSchema, ...fieldSchema };
  const allPaths = !isEmpty(combinedSchema) ? Object.keys(combinedSchema) : [];

  useEffect(() => {
    if (viewSchema && !isEmpty(viewSchema)) {
      setViewSchema(viewSchema);
    }
    if (fieldSchema && !isEmpty(fieldSchema)) {
      setFieldSchema(fieldSchema);
    }
  }, [viewSchema, fieldSchema]);

  const [selectedTab, setSelectedTab] = useRecoilState(
    schemaSelectedSettingsTab
  );
  const filterRuleTab = selectedTab === TAB_OPTIONS_MAP.FILTER_RULE;

  const selectedPathState = selectedPathsState({});
  const [selectedPaths, setSelectedPaths] = useRecoilState<{}>(
    selectedPathState
  );
  // disabled paths are filtered
  const datasetSelectedPaths = selectedPaths[datasetName] || new Set();
  const enabledSelectedPaths =
    datasetSelectedPaths?.size && combinedSchema
      ? [...datasetSelectedPaths]?.filter(
          ({ path }) =>
            path && !disabledField(path, combinedSchema, isGroupDataset)
        )
      : [];

  const excludePathsState = excludedPathsState({});
  const [excludedPaths, setExcludedPaths] = useRecoilState<{}>(
    excludePathsState
  );

  const setShowNestedFields = useCallback(
    (val: boolean) => {
      const newExcludePaths = new Set();
      if (val) {
        excludedPaths?.[datasetName]?.forEach((path) => {
          const subPaths = [...getSubPaths(path)];
          subPaths.forEach((path) => {
            newExcludePaths.add(path);
          });
        });
      } else {
        excludedPaths?.[datasetName]?.forEach((path) => {
          if (
            isVideo
              ? (path.split(".")?.length === 2 && path.startsWith("frames.")) ||
                !path.includes(".")
              : !path.includes(".")
          ) {
            newExcludePaths.add(path);
          }
        });
      }

      setExcludedPaths({ [datasetName]: newExcludePaths });
      setShowNestedFieldsRaw(val);
    },
    [showNestedFields, excludedPaths]
  );

  const [finalSchema, finalSchemaKeyByPath] = useMemo(() => {
    if (!datasetName || !selectedPaths?.[datasetName] || isEmpty(fieldSchema))
      return [[], {}];
    let finalSchemaKeyByPath = {};
    if (isVideo) {
      Object.keys(viewSchema).forEach((fieldPath) => {
        finalSchemaKeyByPath[fieldPath] = viewSchema[fieldPath];
      });
      Object.keys(fieldSchema).forEach((fieldPath) => {
        finalSchemaKeyByPath[fieldPath] = fieldSchema[fieldPath];
      });
    } else {
      finalSchemaKeyByPath = !isEmpty(viewSchema) ? viewSchema : fieldSchema;
    }

    const resSchema = Object.keys(finalSchemaKeyByPath)
      .sort()
      .filter((path) => {
        if (path === "undefined") return false;
        return true;
      })
      .map((path: string) => {
        const pathLabel = path.split(".");
        const hasFrames = path?.startsWith("frames.");
        const count = pathLabel?.length - (hasFrames ? 1 : 0);
        const rawPath = path.replace("frames.", "");
        const pathLabelFinal = searchResults.length
          ? isVideo && viewSchema?.[rawPath]
            ? `frames.${path}`
            : path
          : isVideo && viewSchema?.[rawPath]
          ? `frames.${pathLabel[pathLabel.length - 1]}`
          : pathLabel[pathLabel.length - 1];

        const ftype = finalSchemaKeyByPath[path].ftype;
        const skip = skipField(path, ftype, finalSchemaKeyByPath);
        const disabled =
          disabledField(path, finalSchemaKeyByPath, isGroupDataset) ||
          filterRuleTab;

        const fullPath =
          isVideo && viewSchema?.[path] ? `frames.${path}` : path;

        const isInSearchResult = searchResults.includes(path);
        const isSelected =
          (filterRuleTab && isInSearchResult) ||
          (!filterRuleTab &&
            selectedPaths?.[datasetName] &&
            selectedPaths[datasetName] instanceof Set &&
            selectedPaths[datasetName]?.has(fullPath));

        return {
          path,
          count,
          isSelected,
          pathLabelFinal,
          skip,
          disabled,
          info: finalSchemaKeyByPath[path].info,
          description: finalSchemaKeyByPath[path].description,
          name: finalSchemaKeyByPath[path].name,
        };
      })
      .filter((val) => {
        const rawPath = val.path?.startsWith("frames.")
          ? val.path.replace("frames.", "")
          : val.path;
        return (!filterRuleTab && showNestedFields) ||
          (filterRuleTab && searchResults.length && includeNestedFields)
          ? true
          : !rawPath.includes(".");
      })
      .sort((item, item2) =>
        filterRuleTab && searchResults.length
          ? searchResults.includes(item.path)
            ? -1
            : 1
          : !showNestedFields
          ? item.disabled
            ? 1
            : -1
          : item.path > item2.path
          ? 1
          : item.disabled
          ? 1
          : -1
      );

    return [resSchema, finalSchemaKeyByPath];
  }, [
    searchTerm,
    selectedPaths,
    excludedPaths,
    showNestedFields,
    viewSchema,
    selectedTab,
    searchResults,
    datasetName,
    fieldSchema,
    includeNestedFields,
  ]);

  const [searchSchemaFieldsRaw] = useMutation<foq.searchSelectFieldsMutation>(
    foq.searchSelectFields
  );

  const viewPaths = useMemo(() => Object.keys(viewSchema), [viewSchema]);
  const getPath = useCallback(
    (path: string) => {
      if (dataset && viewSchema) {
        return dataset.mediaType === "video" && viewSchema?.[path]
          ? `frames.${path}`
          : path;
      }
      return path;
    },
    [viewSchema, dataset]
  );

  const mergedSchema = useMemo(
    () => ({ ...viewSchema, ...fieldSchema }),
    [viewSchema, fieldSchema]
  );

  const searchSchemaFields = useCallback(
    (object) => {
      if (!mergedSchema) {
        return;
      }
      searchSchemaFieldsRaw({
        variables: { datasetName, metaFilter: object },
        onCompleted: (data) => {
          if (data) {
            const { searchSelectFields = [] } = data;
            const res = (searchSelectFields as string[])
              .map((p) => p.replace("._cls", ""))
              .filter((pp) => !pp.startsWith("_"));
            setSearchResults(res);
            setSearchMetaFilter(object);

            const shouldExcludePaths = Object.keys(mergedSchema)
              .filter((path) => !searchSelectFields?.includes(path))
              .filter((path) => {
                const childPathsInSearchResults = searchSelectFields.filter(
                  (pp) => pp.startsWith(`${path}.`)
                );
                return !childPathsInSearchResults.length;
              });
            setExcludedPaths({ [datasetName]: shouldExcludePaths });

            const shouldSelectPaths = Object.keys(mergedSchema)
              .filter((path) => searchSelectFields?.includes(path))
              .filter((path) => {
                const childPathsInSearchResults = searchSelectFields.filter(
                  (pp) => pp.startsWith(`${path}.`)
                );
                return !childPathsInSearchResults.length;
              });
            setSelectedPaths({ [datasetName]: new Set(shouldSelectPaths) });
          }
        },
        onError: (e) => {
          console.error("failed to search schema fields", e);
        },
      });
    },
    [datasetName, mergedSchema]
  );

  const setIncludeNestedFields = useCallback(
    (val: boolean) => {
      if (searchMetaFilter) {
        const currentMetaFilter = { ...searchMetaFilter };
        currentMetaFilter["include_nested_fields"] = val;
        searchSchemaFields(currentMetaFilter);
        setIncludeNestedFieldsRaw(val);
      }
    },
    [searchMetaFilter]
  );

  const resetExcludedPaths = useCallback(() => {
    setSelectedPaths({
      [datasetName]: new Set([...viewPaths, ...Object.keys(fieldSchema)]),
    });
    setExcludedPaths({ [datasetName]: new Set() });
    setSearchResults([]);
    setSearchTerm("");
  }, [datasetName, viewPaths, fieldSchema]);

  const getSubPaths = useCallback(
    (path: string) => {
      if (!datasetName) {
        return new Set();
      }
      const subPaths = new Set<string>();
      subPaths.add(getPath(path));
      Object.keys(mergedSchema).forEach((currPath: string) => {
        const ftype = mergedSchema?.[currPath]?.ftype;
        if (
          currPath.startsWith(path + ".") &&
          !skipField(currPath, ftype, mergedSchema)
        ) {
          subPaths.add(getPath(currPath));
        }
      });
      return subPaths;
    },
    [mergedSchema, datasetName, isGroupDataset]
  );

  useEffect(() => {
    if (!isEmpty(fieldSchema) && datasetName && !selectedPaths?.[datasetName]) {
      const combinedSchema = new Set([
        ...Object.keys(viewSchema),
        ...Object.keys(fieldSchema),
      ]);
      setSelectedPaths(() => ({
        [datasetName]: combinedSchema,
      }));
      if (
        !lastAppliedPaths.selected?.length &&
        !lastAppliedPaths.excluded?.length
      ) {
        setLastAppliedPaths({
          selected: [...combinedSchema],
          excluded: [],
        });
      }
    }
  }, [viewSchema, fieldSchema]);

  const toggleSelection = useCallback(
    (rawPath: string, checked: boolean) => {
      if (!selectedPaths || !rawPath || !datasetName) return;
      const pathAndSubPaths = getSubPaths(rawPath);
      if (!pathAndSubPaths.size) {
        return;
      }

      if (checked) {
        const newSelectedPaths = new Set(
          [...selectedPaths[datasetName]].filter(
            (path) => !pathAndSubPaths.has(path)
          )
        );
        const newExcludePaths = new Set([
          ...(excludedPaths[datasetName] || []),
          ...pathAndSubPaths,
        ]);
        setExcludedPaths({ [datasetName]: newExcludePaths });
        setSelectedPaths({ [datasetName]: newSelectedPaths });
      } else {
        const union = new Set<string>([
          ...selectedPaths[datasetName],
          ...pathAndSubPaths,
        ]);
        const datasetExcludedPathsMap = new Set([
          ...(excludedPaths[datasetName] || []),
        ]);
        pathAndSubPaths.forEach((excludePath) => {
          datasetExcludedPathsMap.delete(excludePath);
        });
        setExcludedPaths({
          [datasetName]: datasetExcludedPathsMap,
        });
        setSelectedPaths({ [datasetName]: union });
      }
      setAllFieldsChecked(false);
    },
    [selectedPaths, viewPaths, datasetName, excludedPaths]
  );

  const bareFinalSchema = useMemo(
    () =>
      mergedSchema
        ? finalSchema.filter((field) => {
            return !skipField(
              field.path,
              mergedSchema?.[field.path],
              mergedSchema
            );
          })
        : finalSchema,
    [mergedSchema, finalSchema, isGroupDataset]
  );

  useEffect(() => {
    if (!allPaths?.length || !combinedSchema) return;
    if (lastActionToggleSelection) {
      const val = lastActionToggleSelection[SELECT_ALL];

      if (val) {
        setExcludedPaths({ [datasetName]: new Set() });
        setSelectedPaths({ [datasetName]: new Set([...allPaths]) });
      } else {
        if (includeNestedFields && filterRuleTab) {
          setExcludedPaths({ [datasetName]: new Set(allPaths) });
        } else {
          const topLevelPaths = (allPaths || []).filter((path) =>
            path.startsWith("frames.")
              ? !path.replace("frames.", "").includes(".")
              : !path.includes(".")
          );
          setExcludedPaths({ [datasetName]: new Set(topLevelPaths) });
        }
        const res = Object.values(combinedSchema)
          .filter((f) => disabledField(f.path, combinedSchema, isGroupDataset))
          .map((f) => f.path);

        setSelectedPaths({
          [datasetName]: new Set(res),
        });
      }

      setLastActionToggleSelection(null);
    }
  }, [
    lastActionToggleSelection,
    allPaths,
    setLastActionToggleSelection,
    setExcludedPaths,
    datasetName,
    setSelectedPaths,
    includeNestedFields,
    filterRuleTab,
    combinedSchema,
  ]);

  const setAllFieldsCheckedWrapper = useCallback(
    (val: boolean) => {
      setAllFieldsChecked(val);
      setLastActionToggleSelection({ SELECT_ALL: val });
    },
    [finalSchema]
  );

  // updates the affected fields count
  useEffect(() => {
    if (finalSchema?.length && excludedPaths?.[datasetName]) {
      if (filterRuleTab && searchResults?.length) {
        setAffectedPathCount(
          Object.keys(bareFinalSchema)?.length - searchResults.length
        );
      } else {
        setAffectedPathCount(excludedPaths[datasetName].size);
      }
    }
  }, [
    finalSchema,
    filterRuleTab,
    searchResults,
    excludedPaths,
    datasetName,
    selectedPaths,
  ]);

  return {
    affectedPathCount,
    allFieldsChecked,
    datasetName,
    enabledSelectedPaths,
    excludedPaths,
    expandedPaths,
    filterRuleTab,
    finalSchema,
    finalSchemaKeyByPath,
    includeNestedFields,
    isFilterRuleActive: filterRuleTab,
    isVideo: dataset?.mediaType === "video",
    lastAppliedPaths,
    resetExcludedPaths,
    resetSelectedPaths,
    resetTextFilter,
    searchMetaFilter,
    searchResults,
    searchSchemaFields,
    searchTerm,
    selectedPaths,
    selectedTab,
    setAllFieldsChecked: setAllFieldsCheckedWrapper,
    setExcludedPaths,
    setExpandedPaths,
    setIncludeNestedFields,
    setLastAppliedPaths,
    setSearchResults,
    setSearchTerm,
    setSelectedFieldsStage,
    setSelectedPaths,
    setSelectedTab,
    setSettingsModal,
    setShowMetadata,
    setShowNestedFields,
    settingModal,
    showMetadata,
    showNestedFields,
    toggleSelection,
  };
}
