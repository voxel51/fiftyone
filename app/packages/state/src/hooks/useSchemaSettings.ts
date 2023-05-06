import * as fos from "@fiftyone/state";
import { buildSchema } from "@fiftyone/state";
import { useCallback, useEffect, useMemo } from "react";
import { useRefetchableFragment } from "react-relay";
import {
  atom,
  atomFamily,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import * as foq from "@fiftyone/relay";
import { DICT_FIELD, JUST_FIELD, OBJECT_ID_FIELD } from "@fiftyone/utilities";
import { keyBy } from "lodash";

export const TAB_OPTIONS_MAP = {
  SELECTION: "Selection",
  FILTER_RULE: "FilterRule",
};

export const TAB_OPTIONS = Object.values(TAB_OPTIONS_MAP);

const skipFiled = (path: string, ftype: string) => {
  return (
    ftype === DICT_FIELD ||
    ftype === JUST_FIELD ||
    path.includes(".logits") ||
    path.endsWith(".index") ||
    path.endsWith(".bounding_box")
  );
};
const disabledField = (path: string, ftype: string) => {
  return (
    path === "tags" ||
    path === "filepath" ||
    ftype === OBJECT_ID_FIELD ||
    path.startsWith("metadata") ||
    path.endsWith("frames.frame_number")
  );
};
export const schemaSearchTerm = atom<string>({
  key: "schemaSearchTerm",
  default: "",
});
export const schemaFiledsOnly = atom<boolean>({
  key: "schemaFiledsOnly",
  default: true,
});
export const schemaSelectedSettingsTab = atom<string>({
  key: "schemaSelectedSettingsTab",
  default: TAB_OPTIONS_MAP.FILTER_RULE,
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
export const schemaSearchRestuls = atom<string[]>({
  key: "schemaSearchRestuls",
  default: [],
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPaths) => {
        const viewSchema = await getPromise(viewSchemaState);
        const greenPaths = [...newPaths].filter(
          (path) =>
            path &&
            viewSchema?.[path]?.ftype &&
            !skipFiled(path, viewSchema[path].ftype)
        );
        setSelf(greenPaths);
      });
    },
  ],
});
export const selectedPathsState = atomFamily({
  key: "selectedPathsState",
  default: (param: { allPaths: string[] }) => new Set([...param.allPaths]),
  effects: [
    ({ onSet, getPromise, setSelf }) => {
      onSet(async (newPaths) => {
        const viewSchema = await getPromise(viewSchemaState);

        const greenPaths = [...newPaths].filter(
          (path) =>
            !!path &&
            viewSchema?.[path]?.ftype &&
            !skipFiled(path, viewSchema[path].ftype) &&
            !disabledField(path, viewSchema[path].ftype)
        );
        setSelf(new Set(greenPaths));
      });
    },
  ],
});
export const viewSchemaState = atom({
  key: "viewSchemaState",
  default: null,
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
  const [settingModal, setSettingsModal] = useRecoilState(settingsModal);
  const [showMetadata, setShowMetadata] = useRecoilState(showMetadataState);
  const setSelectedFieldsStage = useSetRecoilState(selectedFieldsStageState);

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
    if (dataset?.name && vStages?.length) {
      refetch(
        { name: dataset?.name, viewStages: vStages || [] },
        {
          fetchPolicy: "store-and-network",
          onComplete: (err) => {
            if (err) {
              console.log("failed to fetch view schema", err);
            }
          },
        }
      );
    }
  }, [vStages]);
  const viewSchema = keyBy(data?.schemaForViewStages, "path");
  const setViewSchema = useSetRecoilState(viewSchemaState);
  useEffect(() => {
    if (viewSchema) {
      setViewSchema(viewSchema);
    }
  }, [viewSchema]);

  const [selectedTab, setSelectedTab] = useRecoilState(
    schemaSelectedSettingsTab
  );

  // useEffect(() => {
  //   if (selectedTab === TAB_OPTIONS_MAP.SELECTION) {
  //     setFieldsOnly(true);
  //   }
  // }, [selectedTab]);

  const [finalSchema] = useMemo(() => {
    if (dataset.mediaType === "video") {
      Object.keys(viewSchema).forEach((fieldPath) => {
        viewSchema[`frames.${fieldPath}`] = {
          ...viewSchema[fieldPath],
          path: `frames.${fieldPath}`,
        };
      });
      Object.keys(schema).forEach((fieldPath) => {
        if (fieldPath === "frames") return;
        viewSchema[fieldPath] = {
          ...schema[fieldPath],
          path: fieldPath,
        };
      });
    }

    const resSchema = Object.keys(viewSchema)
      .sort()
      .filter((path) => {
        if (selectedTab === TAB_OPTIONS_MAP.FILTER_RULE) {
          return searchResults.includes(path);
        }
        return true;
      })
      .map((path: string) => {
        const pathLabel = path.split(".");
        const count = pathLabel?.length;
        const pathLabelFinal =
          dataset.mediaType === "video"
            ? `frames.${pathLabel[pathLabel.length - 1]}`
            : pathLabel[pathLabel.length - 1];
        let isSelected = selectedPaths.has(path);

        const skip = skipFiled(path, viewSchema[path].ftype);
        let disabled = disabledField(path, viewSchema?.[path]?.ftype);

        return {
          path,
          count,
          isSelected: isSelected || disabled,
          pathLabelFinal,
          skip,
          disabled,
          info: viewSchema[path].info,
          description: viewSchema[path].description,
          name: viewSchema[path].name,
        };
      })
      .filter((val) => {
        return fieldsOnly ? !val.path.includes(".") : true;
      })
      .sort((item, item2) =>
        fieldsOnly ? (item.disabled ? 1 : -1) : item.path > item2.path ? 1 : -1
      );

    return [resSchema];
  }, [
    schema,
    searchTerm,
    selectedPaths,
    fieldsOnly,
    viewSchema,
    selectedTab,
    searchResults,
  ]);

  const viewPaths = useMemo(() => Object.keys(viewSchema), [viewSchema]);
  const getSubPaths = useCallback((viewPaths: string[], path: string) => {
    const subPaths = new Set<string>();
    subPaths.add(path);
    viewPaths.forEach((currPath: string) => {
      if (currPath.startsWith(path + ".")) {
        subPaths.add(currPath);
      }
    });
    return subPaths;
  }, []);
  const parentPathList = useCallback(
    (currPathSplit: string[], path: string) => {
      let ppaths = [];
      if (currPathSplit.length > 1) {
        ppaths = [
          path.replace(`.${currPathSplit[currPathSplit.length - 1]}`, ""),
        ];
      }
      return ppaths;
    },
    []
  );

  // toggle field selection
  const toggleSelection = useCallback(
    (path: string, checked: boolean) => {
      const pathAndSubPaths = getSubPaths(viewPaths, path);
      const currPathSplit = path.split(".");

      if (checked) {
        const newSelectedPaths = new Set(
          [...selectedPaths].filter((x) => !pathAndSubPaths.has(x))
        );

        const parentPaths = parentPathList(currPathSplit, path);
        newSelectedPaths.delete(parentPaths[0]);
        setSelectedPaths(newSelectedPaths);
      } else {
        const union = new Set<string>([...selectedPaths, ...pathAndSubPaths]);

        const parentPaths = parentPathList(currPathSplit, path);
        union.add(parentPaths[0]);
        setSelectedPaths(union);
      }
      setAllFieldsChecked(false);
    },
    [selectedPaths, viewPaths]
  );

  // // Reset will cause this effect
  // useEffect(() => {
  //   if (allPaths.length) {
  //     setSelectedPaths(new Set(allPaths));
  //   }
  // }, [revertSelectedPathsState]);

  // select and unselect all
  const setAllFieldsCheckedWrapper = useCallback(
    (val) => {
      setAllFieldsChecked(val);
      const newSelectedPaths = new Set(
        val ? finalSchema.map((pp) => pp.path) : []
      );
      setSelectedPaths(newSelectedPaths);
    },
    [finalSchema]
  );

  // updates the affected fields count
  // useEffect(() => {
  //   if (viewSchema && schema) {
  //     const diff = Object.keys(viewSchema).length - Object.keys(schema).length;
  //     if (diff !== affectedPathCount && diff >= 0) {
  //       setAffectedPathCount(diff);
  //     }
  //   }
  // }, [viewSchema, schema]);

  return {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    fieldsOnly,
    setFieldsOnly,
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
  };
}
