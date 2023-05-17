import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { buildSchema } from "@fiftyone/state";
import {
  DETECTION_FILED,
  Schema,
  UNSUPPORTED_FILTER_TYPES,
} from "@fiftyone/utilities";
import {
  FRAME_NUMBER_FIELD,
  JUST_FIELD,
  OBJECT_ID_FIELD,
} from "@fiftyone/utilities";
import { keyBy } from "lodash";
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

const skipFiled = (path: string, ftype: string, schema: {}) => {
  const parentPath = path.substring(0, path.lastIndexOf("."));

  return (
    UNSUPPORTED_FILTER_TYPES.includes(path) ||
    ftype === JUST_FIELD ||
    (parentPath &&
      schema[parentPath]?.embeddedDocType === DETECTION_FILED &&
      path.endsWith(".bounding_box")) ||
    path.endsWith(".index")
  );
};
const disabledField = (path: string, ftype: string, groupField?: string) => {
  return (
    path === "tags" ||
    path === "filepath" ||
    (ftype === OBJECT_ID_FIELD && path === "id") ||
    ftype === FRAME_NUMBER_FIELD ||
    groupField === path ||
    path === "sample_id" ||
    path.startsWith("metadata") ||
    path.endsWith("frames.frame_number")
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
    open: true,
  },
});
export const allFieldsCheckedState = atom<boolean>({
  key: "allFieldsCheckedState",
  default: true,
});
export const schemaSearchRestuls = atom<string[]>({
  key: "schemaSearchRestuls",
  default: [],
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPaths = []) => {
        const viewSchema = await getPromise(viewSchemaState);
        const schema = await getPromise(schemaState);

        const greenPaths = [...newPaths]
          .filter(
            (path) =>
              path &&
              (viewSchema?.[
                path.startsWith("frames.") ? path.replace("frames.", "") : path
              ]?.ftype ||
                schema?.[path]?.ftype) &&
              !skipFiled(path, viewSchema?.[path]?.ftype, viewSchema)
          )
          .map((path) =>
            path.startsWith("frames.") ? path.replace("frames.", "") : path
          );

        setSelf(greenPaths);
      });
    },
  ],
});
export const selectedPathsState = atomFamily({
  key: "selectedPathsState",
  default: (param: {}) => param,
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPathsMap) => {
        const viewSchema = await getPromise(viewSchemaState);
        const schema = await getPromise(schemaState);
        const dataset = await getPromise(fos.dataset);

        const combinedSchema = { ...schema, ...viewSchema };
        const mapping = {};
        Object.keys(combinedSchema).forEach((path) => {
          if (dataset.mediaType === "image") {
            mapping[path] = path;
          }
          if (dataset.mediaType === "video" && viewSchema) {
            Object.keys(viewSchema).forEach((path) => {
              mapping[path] = `frames.${path}`;
            });
          }
        });

        const newPaths = newPathsMap?.[dataset?.name] || [];
        const greenPaths = [...newPaths]
          .filter(
            (path) =>
              !!path &&
              !skipFiled(
                path,
                viewSchema?.[path]?.ftype || schema?.[path]?.ftype,
                viewSchema
              ) &&
              !disabledField(
                path,
                viewSchema?.[path]?.ftype || schema?.[path]?.ftype,
                dataset?.groupField
              )
          )
          .map((path) => mapping?.[path] || path);

        setSelf({
          ...newPathsMap,
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
        const schema = await getPromise(schemaState);
        const dataset = await getPromise(fos.dataset);
        const showNestedField = await getPromise(showNestedFieldsState);

        const combinedSchema = { ...schema, ...viewSchema };
        const mapping = {};
        Object.keys(combinedSchema).forEach((path) => {
          if (dataset.mediaType === "image") {
            mapping[path] = path;
          }
          if (dataset.mediaType === "video" && viewSchema) {
            Object.keys(viewSchema).forEach((path) => {
              mapping[path] = `frames.${path}`;
            });
          }
        });

        const newPaths = newPathsMap?.[dataset?.name] || [];
        const greenPaths = [...newPaths]
          .filter(
            (path) =>
              !!path &&
              !skipFiled(
                path,
                viewSchema?.[path]?.ftype || schema?.[path]?.ftype,
                viewSchema
              ) &&
              !disabledField(
                path,
                viewSchema?.[path]?.ftype || schema?.[path]?.ftype,
                dataset?.groupField
              )
          )
          .map((path) => mapping?.[path] || path);

        // if top level only, count should be top-level too
        // if nested fields are shown, exclude more granular
        let finalGreenPaths = [];
        if (!showNestedField) {
          finalGreenPaths = greenPaths.filter((path) =>
            dataset.mediaType === "video"
              ? (path.split(".").length === 2 && path.startsWith("frames.")) ||
                !path.includes(".")
              : !path.includes(".")
          );
        } else {
          finalGreenPaths = greenPaths;
        }

        setSelf({
          [dataset?.name]: new Set(finalGreenPaths),
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

  const resetTextFilter = useResetRecoilState(fos.textFilter(false));
  const datasetName = useRecoilValue(fos.datasetName);

  const resetSelectedPaths = useResetRecoilState(selectedPathsState({}));
  const resetExcludedPathsRaw = useResetRecoilState(excludedPathsState({}));

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
  const [searchTerm, setSearchTerm] = useRecoilState<string>(schemaSearchTerm);
  const [searchResults, setSearchResults] = useRecoilState(schemaSearchRestuls);

  const [schema, setSchema] = useRecoilState(schemaState);
  useEffect(() => {
    if (datasetName) {
      console.log("schema", buildSchema(dataset, true));
      setSchema(dataset ? buildSchema(dataset, true) : null);
    }
  }, [datasetName]);

  const [allFieldsChecked, setAllFieldsChecked] = useRecoilState(
    allFieldsCheckedState
  );
  const [includeNestedFields, setIncludeNestedFields] = useRecoilState(
    includeNestedFieldsState
  );

  const [affectedPathCount, setAffectedPathCount] = useRecoilState(
    affectedPathCountState
  );

  const [showNestedFields, setShowNestedFieldsRaw] = useRecoilState<boolean>(
    showNestedFieldsState
  );

  const allPaths = schema ? Object.keys(schema) : [];
  const vStages = useRecoilValue(fos.view);
  const [data, refetch] = useRefetchableFragment<
    foq.viewSchemaFragmentQuery,
    foq.viewSchemaFragmentQuery$data
  >(foq.viewSchema, null);

  useEffect(() => {
    if (datasetName) {
      refetch(
        { name: datasetName, viewStages: vStages || [] },
        {
          fetchPolicy: "network-only",
          onComplete: (err) => {
            if (err) {
              console.error("failed to fetch view schema", err);
            }
          },
        }
      );
    }
  }, [vStages, datasetName]);
  const viewSchema = keyBy(data?.schemaForViewStages, "path");
  const vPaths = Object.keys(viewSchema);

  useEffect(() => {
    if (viewSchema) {
      setViewSchema(viewSchema);
    }
  }, [viewSchema]);

  const [selectedTab, setSelectedTab] = useRecoilState(
    schemaSelectedSettingsTab
  );

  const selectedPathState = selectedPathsState({});
  const [selectedPaths, setSelectedPaths] = useRecoilState<{}>(
    selectedPathState
  );

  const excludePathsState = excludedPathsState({});
  const [excludedPaths, setExcludedPaths] = useRecoilState<{}>(
    excludePathsState
  );

  const setShowNestedFields = useCallback(
    (val: boolean) => {
      let newExcludePaths = new Set();
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
            dataset.mediaType === "video"
              ? (path.split(".").length === 2 && path.startsWith("frames.")) ||
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
    if (!datasetName || !schema || !selectedPaths?.[datasetName])
      return [[], {}];
    let finalSchemaKeyByPath = {};
    if (dataset.mediaType === "video") {
      Object.keys(viewSchema).forEach((fieldPath) => {
        finalSchemaKeyByPath[`frames.${fieldPath}`] = viewSchema[fieldPath];
      });
      Object.keys(schema).forEach((fieldPath) => {
        finalSchemaKeyByPath[fieldPath] = schema[fieldPath];
      });
    } else {
      finalSchemaKeyByPath = viewSchema || schema;
    }

    const filterRuleTab = selectedTab === TAB_OPTIONS_MAP.FILTER_RULE;

    finalSchemaKeyByPath = keyBy(finalSchemaKeyByPath, "path");
    const resSchema = Object.keys(finalSchemaKeyByPath)
      .sort()
      .filter((path) => {
        if (path === "undefined") return false;
        if (filterRuleTab) {
          return searchResults.includes(path);
        }
        return true;
      })
      .map((path: string) => {
        const pathLabel = path.split(".");
        const count = pathLabel?.length;
        const pathLabelFinal = searchResults.length
          ? dataset.mediaType === "video" && viewSchema?.[path]
            ? `frames.${path}`
            : path
          : dataset.mediaType === "video" && viewSchema?.[path]
          ? `frames.${pathLabel[pathLabel.length - 1]}`
          : pathLabel[pathLabel.length - 1];

        const ftype = finalSchemaKeyByPath[path].ftype;
        const skip = skipFiled(path, ftype, finalSchemaKeyByPath);
        const isGroupField = dataset?.groupField;
        const disabled =
          disabledField(path, ftype, isGroupField) || filterRuleTab;

        const fullPath =
          dataset.mediaType === "video" && viewSchema?.[path]
            ? `frames.${path}`
            : path;

        const isSelected =
          selectedPaths?.[datasetName]?.has(fullPath) || filterRuleTab;

        return {
          path,
          count,
          isSelected: isSelected || disabled,
          pathLabelFinal,
          skip,
          disabled,
          info: finalSchemaKeyByPath[path].info,
          description: finalSchemaKeyByPath[path].description,
          name: finalSchemaKeyByPath[path].name,
        };
      })
      .filter((val) => {
        return !showNestedFields ? !val.path.includes(".") : true;
      })
      .sort((item, item2) =>
        !showNestedFields
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
    schema,
    searchTerm,
    selectedPaths,
    excludedPaths,
    showNestedFields,
    viewSchema,
    selectedTab,
    searchResults,
    datasetName,
  ]);

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
    () => ({ ...viewSchema, ...schema }),
    [viewSchema, schema]
  );

  const resetExcludedPaths = useCallback(() => {
    setSelectedPaths({
      [datasetName]: new Set(finalSchema.map((field) => field.path) || []),
    });
    setSelectedPaths({
      [datasetName]: new Set([...viewPaths, ...Object.keys(schema)]),
    });
    setExcludedPaths({ [datasetName]: new Set() });
  }, [datasetName, viewPaths, schema]);

  const getSubPaths = useCallback(
    (path: string) => {
      if (!datasetName) {
        return new Set();
      }
      const subPaths = new Set<string>();
      subPaths.add(getPath(path));
      Object.keys(mergedSchema).forEach((currPath: string) => {
        if (
          currPath.startsWith(path + ".") &&
          !skipFiled(currPath, mergedSchema?.[currPath]?.ftype, mergedSchema) &&
          !disabledField(
            currPath,
            mergedSchema?.[currPath]?.ftype,
            dataset?.groupField
          )
        ) {
          subPaths.add(getPath(currPath));
        }
      });
      return subPaths;
    },
    [mergedSchema, datasetName]
  );

  useEffect(() => {
    if (viewPaths.length && datasetName && !selectedPaths?.[datasetName]) {
      setSelectedPaths((prevValue) => {
        console.log("prevValue", prevValue);
        return {
          [datasetName]: new Set([...viewPaths, ...Object.keys(schema)]),
        };
      });
    }
  }, [viewPaths, datasetName]);

  // toggle field selection
  const toggleSelection = useCallback(
    (rawPath: string, checked: boolean) => {
      if (!selectedPaths || !rawPath || !datasetName) return;
      // improve this by unifying with similar patterns
      // const path = dataset.mediaType === 'video' ? `frames.${rawPath}` : rawPath;
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

  // select and unselect all
  const setAllFieldsCheckedWrapper = useCallback(
    (val) => {
      if (allPaths?.length) {
        setAllFieldsChecked(val);
        const allThePaths = finalSchema.map((ff) => ff.path);
        const newSelectedPaths = new Set(val ? allThePaths : []);
        setSelectedPaths({ [datasetName]: newSelectedPaths });
      }

      if (val) {
        setExcludedPaths({ [datasetName]: new Set() });
      } else {
        if (includeNestedFields && allPaths?.length) {
          setExcludedPaths({ [datasetName]: new Set(allPaths) });
        } else {
          const topLevelPaths = finalSchema
            .map((ff) => ff.path)
            .filter((path) => !path.includes("."));
          setExcludedPaths({ [datasetName]: new Set(topLevelPaths) });
        }
      }
    },
    [finalSchema, allPaths, vPaths, datasetName]
  );

  // updates the affected fields count
  useEffect(() => {
    if (finalSchema?.length && excludedPaths?.[datasetName]) {
      if (
        selectedTab === TAB_OPTIONS_MAP.FILTER_RULE &&
        searchResults?.length
      ) {
        setAffectedPathCount(
          Object.keys(schema)?.length - searchResults.length
        );
      } else {
        setAffectedPathCount(excludedPaths[datasetName].size);
      }
    }
  }, [selectedTab, searchResults, excludedPaths, datasetName]);

  return {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    showNestedFields,
    setShowNestedFields,
    selectedTab,
    setSelectedTab,
    toggleSelection,
    finalSchema,
    selectedPaths,
    setSelectedPaths,
    allFieldsChecked,
    setAllFieldsChecked: setAllFieldsCheckedWrapper,
    searchResults,
    setSearchResults,
    showMetadata,
    setShowMetadata,
    setSelectedFieldsStage,
    affectedPathCount,
    mediatType: dataset.mediaType,
    dataset,
    resetTextFilter,
    datasetName,
    includeNestedFields,
    setIncludeNestedFields,
    finalSchemaKeyByPath,
    excludedPaths,
    resetSelectedPaths,
    resetExcludedPaths,
  };
}
