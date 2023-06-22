import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

export default function useSchemaSettingsControls() {
  const [showMetadata, setShowMetadata] = useRecoilState(fos.showMetadataState);

  const dataset = useRecoilValue(fos.dataset);

  const datasetName = useRecoilValue(fos.datasetName);

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

  const [showNestedFields, setShowNestedFieldsRaw] = useRecoilState<boolean>(
    fos.showNestedFieldsState
  );

  const [searchMetaFilter, setSearchMetaFilter] = useRecoilState(
    fos.searchMetaFilterState
  );

  const [expandedPaths, setExpandedPaths] = useRecoilState(
    fos.expandedPathsState
  );

  const [lastActionToggleSelection, setLastActionToggleSelection] =
    useRecoilState(fos.lastActionToggleSelectionState);

  const [selectedTab, setSelectedTab] = useRecoilState(
    fos.schemaSelectedSettingsTab
  );
  const filterRuleTab = selectedTab === fos.TAB_OPTIONS_MAP.FILTER_RULE;

  const [excludedPaths, setExcludedPaths] = useRecoilState<{}>(
    fos.excludedPathsState({})
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
    [showNestedFields]
  );

  const setIncludeNestedFields = useCallback(
    (val: boolean) => {
      if (searchMetaFilter) {
        const currentMetaFilter = { ...searchMetaFilter };
        currentMetaFilter["include_nested_fields"] = val;
        // searchSchemaFields(currentMetaFilter); TODO
        setIncludeNestedFieldsRaw(val);
      }
    },
    [searchMetaFilter]
  );

  const setAllFieldsCheckedWrapper = useCallback((val: boolean) => {
    setAllFieldsChecked(val);
    setLastActionToggleSelection({ SELECT_ALL: val });
  }, []);

  return {
    allFieldsChecked,
    datasetName,
    expandedPaths,
    filterRuleTab,
    includeNestedFields,
    isFilterRuleActive: filterRuleTab,
    isVideo: dataset?.mediaType === "video",
    searchMetaFilter,
    searchTerm,
    selectedTab,
    setAllFieldsChecked: setAllFieldsCheckedWrapper,
    setExpandedPaths,
    setIncludeNestedFields,
    setSearchTerm,
    setSelectedTab,
    setShowMetadata,
    setShowNestedFields,
    showMetadata,
    showNestedFields,
  };
}
