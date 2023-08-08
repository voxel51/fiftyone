import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import _, { isEmpty, keyBy } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import { useRefetchableFragment } from "react-relay";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import useSetShowNestedFields from "./schema/useSetShowNestedFields";
import {
  disabledField,
  getSubPaths,
  skipField,
} from "./useSchemaSettings.utils";

const SELECT_ALL = "SELECT_ALL";

export default function useSchemaSettings() {
  const [settingModal, setSettingsModal] = useRecoilState(fos.settingsModal);
  const [showMetadata, setShowMetadata] = useRecoilState(fos.showMetadataState);
  const dataset = useRecoilValue(fos.dataset);
  const isGroupDataset = dataset?.groupField;

  const resetTextFilter = useResetRecoilState(fos.textFilter(false));
  const datasetName = useRecoilValue(fos.datasetName);

  const resetSelectedPaths = useResetRecoilState(fos.selectedPathsState({}));

  const [filters, setFilters] = useRecoilState(fos.filters);
  const [modalFilters, setModalFilters] = useRecoilState(fos.modalFilters);
  const [attributeVisibility, setAttributeVisibility] = useRecoilState(
    fos.attributeVisibility
  );
  const [modalAttributeVisibility, setModalAttributeVisibility] =
    useRecoilState(fos.modalAttributeVisibility);

  const resetAttributeFilters = () => {
    !_.isEmpty(filters) && setFilters({});
    !_.isEmpty(modalFilters) && setModalFilters({});
    !_.isEmpty(attributeVisibility) && setAttributeVisibility({});
    !_.isEmpty(modalAttributeVisibility) && setModalAttributeVisibility({});
  };

  const setViewSchema = useSetRecoilState(fos.viewSchemaState);
  const setFieldSchema = useSetRecoilState(fos.fieldSchemaState);
  const [searchTerm, setSearchTerm] = useRecoilState<string>(
    fos.schemaSearchTerm
  );
  const isVideo = dataset.mediaType === "video";

  const [allFieldsChecked, setAllFieldsChecked] = useRecoilState(
    fos.allFieldsCheckedState
  );

  const [includeNestedFields, setIncludeNestedFieldsRaw] = useRecoilState(
    fos.includeNestedFieldsState
  );

  const [affectedPathCount, setAffectedPathCount] = useRecoilState(
    fos.affectedPathCountState
  );

  const [lastAppliedPaths, setLastAppliedPaths] = useRecoilState(
    fos.lastAppliedPathsState
  );

  const isPatchesView = useRecoilValue(fos.isPatchesView);
  const isFrameView = useRecoilValue(fos.isFramesView);
  const isClipsView = useRecoilValue(fos.isClipsView);

  const [expandedPaths, setExpandedPaths] = useRecoilState(
    fos.expandedPathsState
  );

  const [lastActionToggleSelection, setLastActionToggleSelection] =
    useRecoilState(fos.lastActionToggleSelectionState);

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

  const { showNestedFields, setShowNestedFields } = useSetShowNestedFields(
    fieldSchema,
    viewSchema
  );

  const [selectedTab, setSelectedTab] = useRecoilState(
    fos.schemaSelectedSettingsTab
  );
  const filterRuleTab = selectedTab === fos.TAB_OPTIONS_MAP.FILTER_RULE;

  const selectedPathState = fos.selectedPathsState({});
  const [selectedPaths, setSelectedPaths] = useRecoilState(selectedPathState);
  // disabled paths are filtered
  const enabledSelectedPaths = useMemo(() => {
    const datasetSelectedPaths = selectedPaths[datasetName] || new Set();

    return datasetSelectedPaths?.size && combinedSchema
      ? [...datasetSelectedPaths]?.filter(
          ({ path }) =>
            path &&
            !disabledField(
              path,
              combinedSchema,
              isGroupDataset,
              isFrameView,
              isClipsView,
              isVideo,
              isPatchesView
            )
        )
      : [];
  }, [
    combinedSchema,
    datasetName,
    isClipsView,
    isFrameView,
    isGroupDataset,
    isPatchesView,
    isVideo,
    selectedPaths,
  ]);

  const excludedPathsState = fos.excludedPathsState({});
  const [excludedPaths, setExcludedPaths] = useRecoilState(excludedPathsState);

  const mergedSchema = useMemo(
    () => ({ ...viewSchema, ...fieldSchema }),
    [viewSchema, fieldSchema]
  );

  const {
    searchResults,
    searchMetaFilter,
    searchSchemaFields,
    setSearchResults,
  } = fos.useSearchSchemaFields(mergedSchema);

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

        const skip = skipField(path, finalSchemaKeyByPath);
        const disabled =
          disabledField(
            path,
            finalSchemaKeyByPath,
            isGroupDataset,
            isFrameView,
            isClipsView,
            isVideo,
            isPatchesView
          ) || filterRuleTab;

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
    isPatchesView,
    isClipsView,
    isVideo,
  ]);

  const viewPaths = useMemo(() => Object.keys(viewSchema), [viewSchema]);

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
      const pathAndSubPaths = getSubPaths(
        rawPath,
        fieldSchema,
        dataset.mediaType,
        viewSchema
      );
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
    [
      selectedPaths,
      datasetName,
      fieldSchema,
      dataset.mediaType,
      viewSchema,
      setAllFieldsChecked,
      excludedPaths,
      setExcludedPaths,
      setSelectedPaths,
    ]
  );

  const bareFinalSchema = useMemo(
    () =>
      mergedSchema
        ? finalSchema.filter((field) => {
            return !skipField(field.path, mergedSchema);
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
          .filter((f) =>
            disabledField(
              f.path,
              combinedSchema,
              isGroupDataset,
              isFrameView,
              isClipsView,
              isVideo,
              isPatchesView
            )
          )
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
    isPatchesView,
    isClipsView,
    isVideo,
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
    searchTerm,
    selectedPaths,
    selectedTab,
    setAllFieldsChecked: setAllFieldsCheckedWrapper,
    setExcludedPaths,
    setExpandedPaths,
    setIncludeNestedFields,
    setLastAppliedPaths,
    setSearchTerm,
    setSelectedPaths,
    setSelectedTab,
    setSettingsModal,
    setShowMetadata,
    setShowNestedFields,
    settingModal,
    showMetadata,
    showNestedFields,
    toggleSelection,
    mergedSchema,
    resetAttributeFilters,
  };
}
