import * as fos from "@fiftyone/state";
import { buildSchema, useSetView } from "@fiftyone/state";
import { useCallback, useEffect, useMemo } from "react";
import { useRefetchableFragment } from "react-relay";
import { atom, atomFamily, useRecoilState, useRecoilValue } from "recoil";
import * as foq from "@fiftyone/relay";
import { DICT_FIELD, JUST_FIELD } from "@fiftyone/utilities";
import { keyBy } from "lodash";

export const TAB_OPTIONS_MAP = {
  SELECTION: "Selection",
  FILTER_RULE: "FilterRule",
};

export const TAB_OPTIONS = Object.values(TAB_OPTIONS_MAP);

export const schemaSearchTerm = atom<string>({
  key: "schemaSearchTerm",
  default: "",
});
export const schemaSearchRestuls = atom<string[]>({
  key: "schemaSearchRestuls",
  default: [],
});
export const schemaFiledsOnly = atom<boolean>({
  key: "schemaFiledsOnly",
  default: true,
});
export const originalSelectedPathsState = atom<Set<string>>({
  key: "originalSelectedPathsState",
  default: new Set(),
});
export const schemaSelectedSettingsTab = atom<string>({
  key: "schemaSelectedSettingsTab",
  default: TAB_OPTIONS_MAP.FILTER_RULE,
});
export const schemaForViewStagesState = atom<string[]>({
  key: "schemaForViewStages",
  default: [],
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
export const selectedPathsState = atomFamily({
  key: "selectedPathsState",
  default: (param: { allPaths: string[] }) => new Set([...param.allPaths]),
});
export const showMetadataState = atom({
  key: "showMetadataState",
  default: false,
});
export const revertSelectedPathsState = atom({
  key: "revertSelectedPathsState",
  default: false,
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
        context.history.replace(
          `${context.history.location.pathname}${context.history.location.search}`,
          {
            ...context.history.location.state,
            selectedFieldsStage: value || null,
          }
        );
      });
    },
  ],
});

export default function useSchemaSettings() {
  const activeLabelPaths = useRecoilValue(
    fos.activeLabelPaths({ modal: false })
  );

  const send = fos.useSendEvent();

  const subscription = useRecoilValue(fos.stateSubscription);

  const [settingModal, setSettingsModal] = useRecoilState(settingsModal);
  const [showMetadata, setShowMetadata] = useRecoilState(showMetadataState);
  const [selectedFieldsStage, setSelectedFieldsStage] = useRecoilState(
    selectedFieldsStageState
  );

  const [schemaForViewStages, setSchemaForViewStages] = useRecoilState(
    schemaForViewStagesState
  );

  const [searchTerm, setSearchTerm] = useRecoilState<string>(schemaSearchTerm);
  const [searchResults, setSearchResults] = useRecoilState(schemaSearchRestuls);

  const dataset = useRecoilValue(fos.dataset);
  const schema = dataset ? buildSchema(dataset, true) : null;

  const [allFieldsChecked, setAllFieldsChecked] = useRecoilState(
    allFieldsCheckedState
  );

  const [affectedPathCount, setAffectedPathCount] = useRecoilState(
    affectedPathCountState
  );

  const [fieldsOnly, setFieldsOnly] = useRecoilState<boolean>(schemaFiledsOnly);

  const allPaths = Object.keys(schema);
  const [selectedPaths, setSelectedPaths] = useRecoilState<Set<string>>(
    selectedPathsState({ allPaths })
  );
  const vStages = useRecoilValue(fos.view);
  const [data, refetch] = useRefetchableFragment<
    foq.viewSchemaFragmentQuery,
    foq.viewSchemaFragmentQuery$data
  >(foq.viewSchema, null);

  useEffect(() => {
    refetch(
      { name: dataset?.name, viewStages: vStages || [] },
      {
        fetchPolicy: "network-only",
        onComplete: (err) => {
          if (err) {
            console.log("failed to fetch view schema", err);
          }
        },
      }
    );
  }, [refetch, vStages]);
  const viewSchema = keyBy(data?.schemaForViewStages, "path");
  const [selectedTab, setSelectedTab] = useRecoilState(
    schemaSelectedSettingsTab
  );

  useEffect(() => {
    if (selectedTab === TAB_OPTIONS_MAP.SELECTION) {
      setSearchResults([]);
    }
  }, [selectedTab]);

  const finalSchema = useMemo(
    () =>
      Object.keys(viewSchema)
        ?.sort()
        ?.filter((path) => {
          if (selectedTab === TAB_OPTIONS_MAP.FILTER_RULE) {
            return searchResults.includes(path);
          }
          return true;
        })
        ?.map((path: string) => {
          const pathLabel = path.split(".");
          const count = pathLabel?.length;
          const pathLabelFinal = pathLabel[pathLabel.length - 1];
          let isSelected = selectedPaths.has(path);

          const skip =
            viewSchema?.[path]?.ftype === DICT_FIELD ||
            viewSchema?.[path]?.ftype === JUST_FIELD ||
            path.includes(".logits") ||
            path.endsWith(".index") ||
            path.endsWith(".bounding_box");

          let disabled =
            path.endsWith(".id") ||
            path === "id" ||
            path === "tags" ||
            path === "filepath" ||
            path.startsWith("metadata");

          if (selectedTab === "Search") {
            disabled = true;
            isSelected = true;
          }

          if (!schema?.[path]) {
            return {
              path,
              count,
              isSelected,
              pathLabelFinal,
              skip,
              disabled,
              info: viewSchema?.[path].info,
              description: viewSchema?.[path].description,
              name: viewSchema?.[path].name || pathLabelFinal,
            };
          }

          return {
            path,
            count,
            isSelected,
            pathLabelFinal,
            skip,
            disabled,
            info: schema[path].info,
            description: schema[path].description,
            name: schema[path].name,
          };
        }),
    [
      schema,
      searchTerm,
      selectedPaths,
      fieldsOnly,
      viewSchema,
      selectedTab,
      searchResults,
    ]
  );

  const finalSchemaForView = useMemo(() => {
    return finalSchema
      ?.filter((val) => {
        return fieldsOnly ? !val.path.includes(".") : true;
      })
      .sort((item) => (fieldsOnly ? (item.disabled ? 1 : -1) : 0));
  }, [finalSchema]);
  const finalSchemaDict = keyBy(finalSchema, "path");

  const getSelectedSubPaths = useCallback(
    (path: string) => {
      const tmpSelected = new Set();
      allPaths.map((currPath: string) => {
        if (currPath.startsWith(path)) {
          tmpSelected.add(currPath);
        }
      });
      return tmpSelected;
    },
    [allPaths]
  );

  const [originalSelectedPaths, setOriginalSelectedPaths] = useRecoilState(
    originalSelectedPathsState
  );

  useEffect(() => {
    if (!originalSelectedPaths?.size && selectedPaths?.size) {
      setOriginalSelectedPaths(selectedPaths);
    }
  }, [selectedPaths]);

  // if activeLabelPaths, include them as visible
  useEffect(() => {
    const finalPaths = [];
    if (activeLabelPaths?.length) {
      for (let i = 0; i < activeLabelPaths?.length; i++) {
        const currPath = activeLabelPaths[i];
        const subPaths = getSelectedSubPaths(activeLabelPaths[i]);

        // detects on parent - should refatcor this when v1
        const currPathSplit = currPath.split(".");
        let parentPaths = [];
        if (currPathSplit.length > 1) {
          parentPaths = [
            currPath.replace(`.${currPathSplit[currPathSplit.length - 1]}`, ""),
          ];
        }
        finalPaths.push(currPath, ...subPaths, ...parentPaths);
      }
    }
  }, [activeLabelPaths]);

  const setView = useSetView();

  const toggleSelection = useCallback(
    (path: string, checked: boolean) => {
      const subPaths = new Set<string>();
      Object.keys(viewSchema).map((currPath: string) => {
        if (currPath.startsWith(path)) {
          subPaths.add(currPath);
        }
      });
      const currPathSplit = path.split(".");

      if (checked) {
        const diff = new Set(
          [...selectedPaths].filter((x) => !subPaths.has(x))
        );

        let parentPaths = [];
        if (currPathSplit.length > 1) {
          parentPaths = [
            path.replace(`.${currPathSplit[currPathSplit.length - 1]}`, ""),
          ];
          diff.delete(parentPaths[0]);
        }
        setSelectedPaths(diff);
      } else {
        const union = new Set<string>(
          [...selectedPaths, ...subPaths].filter((ppath) => {
            return (
              !finalSchemaDict?.[ppath]?.disabled &&
              !finalSchemaDict?.[ppath]?.skip
            );
          })
        );

        let parentPaths = [];
        if (currPathSplit.length > 1) {
          parentPaths = [
            path.replace(`.${currPathSplit[currPathSplit.length - 1]}`, ""),
          ];
          union.add(parentPaths[0]);
        }
        setSelectedPaths(union);
      }
      setAllFieldsChecked(false);
    },
    [viewSchema, selectedPaths, setSelectedPaths, schema, finalSchemaDict]
  );

  useEffect(() => {
    if (allPaths.length) {
      setSelectedPaths(new Set(allPaths));
    }
  }, [revertSelectedPathsState]);

  const finalSchemaPaths = finalSchema.map((pp) => pp.path);
  const setAllFieldsCheckedWra = (val) => {
    setAllFieldsChecked(val);
    if (val) {
      setSelectedPaths(new Set(finalSchemaPaths));
    } else {
      setSelectedPaths(
        new Set(
          finalSchema
            .filter(({ disabled }) => !!disabled)
            .map(({ path }) => path)
        )
      );
    }
  };

  const finalSelectedPaths = useMemo(
    () =>
      new Set(
        [...(searchResults.length ? searchResults : selectedPaths)].filter(
          (path) => {
            return !(
              schema?.[path]?.ftype === DICT_FIELD ||
              schema?.[path]?.ftype === JUST_FIELD ||
              path.includes(".logits") ||
              path.endsWith(".index") ||
              path.endsWith(".bounding_box")
            );
          }
        )
      ),
    [selectedPaths, schema, searchResults]
  );

  useEffect(() => {
    const diff = Object.keys(viewSchema).length - Object.keys(schema).length;
    if (diff) {
      setAffectedPathCount(diff);
    }
  }, [viewSchema, schema, setAffectedPathCount]);

  return {
    activeLabelPaths,
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    schema,
    fieldsOnly,
    setFieldsOnly,
    selectedTab,
    setSelectedTab,
    setView,
    toggleSelection,
    finalSchema,
    finalSchemaForView,
    setSelectedPaths,
    originalSelectedPaths,
    selectedPaths,
    finalSelectedPaths,
    allFieldsChecked,
    setAllFieldsChecked: setAllFieldsCheckedWra,
    searchResults,
    setSearchResults,
    showMetadata,
    setShowMetadata,
    selectedFieldsStage,
    setSelectedFieldsStage,
    subscription,
    send,
    schemaForViewStages,
    setSchemaForViewStages,
    dataset,
    affectedPathCount,
  };
}
