import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import _, { isEmpty, keyBy } from "lodash";
import { useCallback, useEffect, useMemo } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
// import useSetShowNestedFields from "./schema/useSetShowNestedFields";
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
  { key: "viewSchemeSelector" }
);

export default function useSchemaSettings() {
  const [settingModal, setSettingsModal] = useRecoilState(fos.settingsModal);
  const [showMetadata, setShowMetadata] = useRecoilState(fos.showMetadataState);
  const dataset = useRecoilValue<fos.State.Dataset>(fos.dataset);
  const isGroupDataset = dataset?.groupField;
  const isFieldVisibilityActive = useRecoilValue(fos.isFieldVisibilityActive);

  const resetTextFilter = useResetRecoilState(fos.textFilter(false));
  const datasetName = useRecoilValue(fos.datasetName) as string;

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

  const fieldVisibilityStage = useRecoilValue(fos.fieldVisibilityStage);
  const extendedExcludedPaths = fieldVisibilityStage?.kwargs?.field_names || [];
  const affectedPathCount = extendedExcludedPaths?.length || 0;

  const isPatchesView = useRecoilValue(fos.isPatchesView);
  const isFrameView = useRecoilValue(fos.isFramesView);
  const isClipsView = useRecoilValue(fos.isClipsView);

  const [expandedPaths, setExpandedPaths] = useRecoilState(
    fos.expandedPathsState
  );

  const data = useRecoilValue(viewSchemaSelector);

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

  useEffect(() => {
    if (viewSchema && !isEmpty(viewSchema)) {
      setViewSchema(viewSchema);
    }
    if (fieldSchema && !isEmpty(fieldSchema)) {
      setFieldSchema(fieldSchema);
    }
  }, [viewSchema, fieldSchema, setViewSchema, setFieldSchema]);

  // const { showNestedFields, setShowNestedFields } = useSetShowNestedFields(
  //   fieldSchema,
  //   viewSchema
  // );
  const [showNestedFields, setShowNestedFields] = useRecoilState<boolean>(
    fos.showNestedFieldsState
  );

  const [selectedTab, setSelectedTab] = useRecoilState(
    fos.schemaSelectedSettingsTab
  );
  const filterRuleTab = selectedTab === fos.TAB_OPTIONS_MAP.FILTER_RULE;

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
            isPatchesView
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
          : -1
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
    [searchMetaFilter, searchSchemaFields, setIncludeNestedFieldsRaw]
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
        dataset.mediaType,
        viewSchema
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
      dataset.mediaType,
      viewSchema,
      setAllFieldsChecked,
      excludedPaths,
      setExcludedPaths,
    ]
  );

  const setAllFieldsCheckedWrapper = useCallback(
    (val: boolean) => {
      setAllFieldsChecked(val);
      if (includeNestedFields) {
        console.log("includeNestedFields", val, allPaths);
        setExcludedPaths({
          [datasetName]: val ? new Set([]) : new Set(allPaths),
        });
      } else {
        const topLevelPaths = (allPaths || []).filter((path) =>
          path.startsWith("frames.")
            ? !path.replace("frames.", "").includes(".")
            : !path.includes(".")
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
    ]
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
  };
}
