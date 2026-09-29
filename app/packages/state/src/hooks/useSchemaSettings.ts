import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import _, { isEmpty, keyBy } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import {
  useReverbState,
  useReverbValue,
  useResetReverbState,
  useSetReverbState,
} from "@fiftyone/reverb";
import {
  disabledField,
  getSubPaths,
  skipField,
} from "./useSchemaSettings.utils";

const viewSchemaSelector = foq.graphQLSyncFragmentAtom<
  foq.viewSchemaFragment$key,
  foq.viewSchemaFragment$data
>(
  {
    fragments: [foq.viewSchemaFragment],
    default: null,
  },
  { key: "viewSchemeSelector" },
);

export default function useSchemaSettings() {
  const [settingModal, setSettingsModal] = useReverbState(fos.settingsModal);
  const [showMetadata, setShowMetadata] = useReverbState(fos.showMetadataState);
  const dataset = useReverbValue<fos.State.Dataset>(fos.dataset);
  const isGroupDataset = dataset?.groupField;
  const isFieldVisibilityActive = useReverbValue(fos.isFieldVisibilityActive);

  const resetTextFilter = useResetReverbState(fos.textFilter(false));
  const datasetName = useReverbValue(fos.datasetName) as string;

  const [filters, setFilters] = useReverbState(fos.filters);
  const [modalFilters, setModalFilters] = useReverbState(fos.modalFilters);
  const [attributeVisibility, setAttributeVisibility] = useReverbState(
    fos.attributeVisibility,
  );
  const [modalAttributeVisibility, setModalAttributeVisibility] =
    useReverbState(fos.modalAttributeVisibility);

  const resetAttributeFilters = () => {
    !_.isEmpty(filters) && setFilters({});
    !_.isEmpty(modalFilters) && setModalFilters({});
    !_.isEmpty(attributeVisibility) && setAttributeVisibility({});
    !_.isEmpty(modalAttributeVisibility) && setModalAttributeVisibility({});
  };

  const excludedPathsStripped = useReverbValue(fos.excludedPathsStrippedState);

  const setViewSchema = useSetReverbState(fos.viewSchemaState);
  const setFieldSchema = useSetReverbState(fos.fieldSchemaState);
  const [searchTerm, setSearchTerm] = useReverbState<string>(
    fos.schemaSearchTerm,
  );
  const isVideo = dataset?.mediaType === "video";

  const [allFieldsChecked, setAllFieldsChecked] = useReverbState(
    fos.allFieldsCheckedState,
  );

  const [includeNestedFields, setIncludeNestedFieldsRaw] = useReverbState(
    fos.includeNestedFieldsState,
  );

  const fieldVisibilityStage = useReverbValue(fos.fieldVisibilityStage);
  const extendedExcludedPaths = fieldVisibilityStage?.kwargs?.field_names || [];
  const affectedPathCount = extendedExcludedPaths?.length || 0;

  const isPatchesView = useReverbValue(fos.isPatchesView);
  const isFrameView = useReverbValue(fos.isFramesView);
  const isClipsView = useReverbValue(fos.isClipsView);

  const [expandedPaths, setExpandedPaths] = useReverbState(
    fos.expandedPathsState,
  );

  const data = useReverbValue(viewSchemaSelector);

  const { fieldSchema: fieldSchemaRaw, frameFieldSchema } =
    data?.schemaForViewStages || {};

  const viewSchema = keyBy(frameFieldSchema, "path");
  const fieldSchema = keyBy(fieldSchemaRaw, "path");
  const combinedSchema = useMemo(() => {
    return { ...viewSchema, ...fieldSchema };
  }, [fieldSchema, viewSchema]);

  const allPaths = useMemo(() => {
    return !isEmpty(combinedSchema) ? Object.keys(combinedSchema) : [];
  }, [combinedSchema]);

  const excludedPathsState = fos.excludedPathsState({});
  const [excludedPaths, setExcludedPaths] = useReverbState(excludedPathsState);

  useEffect(() => {
    // when dataset changes, we need to initialize the excludedPaths
    // so all fields are selected by default
    if (datasetName && !excludedPaths?.[datasetName]) {
      setExcludedPaths({ [datasetName]: new Set() });
      setAllFieldsChecked(true);
    }
  }, [
    datasetName,
    fieldVisibilityStage,
    excludedPaths,
    setExcludedPaths,
    setAllFieldsChecked,
  ]);

  useEffect(() => {
    if (viewSchema && !isEmpty(viewSchema)) {
      setViewSchema(viewSchema);
    }
    if (fieldSchema && !isEmpty(fieldSchema)) {
      setFieldSchema(fieldSchema);
    }
  }, [viewSchema, fieldSchema, setViewSchema, setFieldSchema]);

  const [showNestedFields, setShowNestedFields] = useReverbState<boolean>(
    fos.showNestedFieldsState,
  );

  const [selectedTab, setSelectedTab] = useReverbState(
    fos.schemaSelectedSettingsTab,
  );
  const filterRuleTab = selectedTab === fos.TAB_OPTIONS_MAP.FILTER_RULE;

  const mergedSchema = useMemo(
    () => ({ ...viewSchema, ...fieldSchema }),
    [viewSchema, fieldSchema],
  );

  const {
    searchResults,
    searchMetaFilter,
    searchSchemaFields,
    setSearchResults,
  } = fos.useSearchSchemaFields(mergedSchema);

  const [finalSchema, finalSchemaKeyByPath] = useMemo(() => {
    if (!datasetName || isEmpty(fieldSchema)) return [[], {}];
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
      .filter((path) => path !== "undefined")
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
            isPatchesView,
          ) || filterRuleTab;

        const fullPath =
          isVideo && viewSchema?.[path] ? `frames.${path}` : path;

        const isInSearchResult = searchResults.includes(path);
        const isSelected =
          (filterRuleTab && isInSearchResult) ||
          (!filterRuleTab &&
            excludedPaths?.[datasetName] &&
            excludedPaths[datasetName] instanceof Set &&
            !excludedPaths[datasetName]?.has(fullPath));

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
                : -1,
      );

    return [resSchema, finalSchemaKeyByPath];
  }, [
    datasetName,
    fieldSchema,
    isVideo,
    viewSchema,
    searchResults,
    isGroupDataset,
    isFrameView,
    isClipsView,
    isPatchesView,
    filterRuleTab,
    excludedPaths,
    showNestedFields,
    includeNestedFields,
  ]);

  const setIncludeNestedFields = useCallback(
    (val: boolean) => {
      if (searchMetaFilter) {
        const currentMetaFilter = { ...searchMetaFilter };
        currentMetaFilter["include_nested_fields"] = val;
        searchSchemaFields(currentMetaFilter);
        setIncludeNestedFieldsRaw(val);
      }
    },
    [searchMetaFilter, searchSchemaFields, setIncludeNestedFieldsRaw],
  );

  const resetExcludedPaths = useCallback(() => {
    setExcludedPaths({ [datasetName]: new Set() });
    setSearchResults([]);
    setSearchTerm("");
  }, [setExcludedPaths, datasetName, setSearchResults, setSearchTerm]);

  const toggleSelection = useCallback(
    (rawPath: string, checked: boolean) => {
      if (!rawPath || !datasetName) return;
      const pathAndSubPaths = getSubPaths(
        rawPath,
        fieldSchema,
        dataset?.mediaType,
        viewSchema,
      );
      if (!pathAndSubPaths.size) {
        return;
      }

      if (checked) {
        const newExcludePaths = new Set([
          ...(excludedPaths[datasetName] || []),
          ...pathAndSubPaths,
        ]);
        setExcludedPaths({ [datasetName]: newExcludePaths });
      } else {
        const datasetExcludedPathsMap = new Set([
          ...(excludedPaths[datasetName] || []),
        ]);
        pathAndSubPaths.forEach((excludePath) => {
          datasetExcludedPathsMap.delete(excludePath);
        });
        setExcludedPaths({
          [datasetName]: datasetExcludedPathsMap,
        });
      }
      setAllFieldsChecked(false);
    },
    [
      datasetName,
      fieldSchema,
      dataset?.mediaType,
      viewSchema,
      setAllFieldsChecked,
      excludedPaths,
      setExcludedPaths,
    ],
  );

  const setAllFieldsCheckedWrapper = useCallback(
    (val: boolean) => {
      setAllFieldsChecked(val);
      if (includeNestedFields) {
        setExcludedPaths({
          [datasetName]: val ? new Set([]) : new Set(allPaths),
        });
      } else {
        const topLevelPaths = (allPaths || []).filter((path) =>
          path.startsWith("frames.")
            ? !path.replace("frames.", "").includes(".")
            : !path.includes("."),
        );
        setExcludedPaths({
          [datasetName]: val ? new Set() : new Set(topLevelPaths),
        });
      }
    },
    [
      setAllFieldsChecked,
      setExcludedPaths,
      datasetName,
      includeNestedFields,
      allPaths,
    ],
  );

  return {
    affectedPathCount,
    allFieldsChecked,
    datasetName,
    excludedPaths,
    expandedPaths,
    filterRuleTab,
    finalSchema,
    finalSchemaKeyByPath,
    includeNestedFields,
    isFilterRuleActive: filterRuleTab,
    isVideo,
    resetExcludedPaths,
    resetTextFilter,
    searchTerm,
    selectedTab,
    setAllFieldsChecked: setAllFieldsCheckedWrapper,
    setExcludedPaths,
    setExpandedPaths,
    setIncludeNestedFields,
    setSearchTerm,
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
    isFieldVisibilityActive,
    extendedExcludedPaths,
    excludedPathsStripped,
  };
}
