import { useRecoilState, atom, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { buildSchema, useSetView } from "@fiftyone/state";
import { useCallback, useEffect, useMemo } from "react";

// TODO: move schemaSettings attom here
const schemaSearchTerm = atom<string>({
  key: "schemaSearchTerm",
  default: "",
});
const schemaFiledsOnly = atom<boolean>({
  key: "schemaFiledsOnly",
  default: true,
});
const originalSelectedPathsState = atom<Set<string>>({
  key: "originalSelectedPathsState",
  default: new Set(),
});
const schemaSelectedSettingsTab = atom<string>({
  key: "schemaSelectedSettingsTab",
  default: "Selection",
});

export const TAG_OPTIONS_MAP = {
  SELECTION: "Selection",
  SEARCH: "Search",
};

export const TAB_OPTIONS = Object.values(TAG_OPTIONS_MAP);
export default function useSchemaSettings() {
  const activeLabelPaths = useRecoilValue(
    fos.activeLabelPaths({ modal: false })
  );

  const [settingModal, setSettingsModal] = useRecoilState(fos.settingsModal);

  const [searchTerm, setSearchTerm] = useRecoilState<string>(schemaSearchTerm);

  const dataset = useRecoilValue(fos.dataset);
  const schema = dataset ? buildSchema(dataset, true) : null;

  const [fieldsOnly, setFieldsOnly] = useRecoilState<boolean>(schemaFiledsOnly);

  const getSelectedSubPaths = useCallback(
    (path: string) => {
      const tmpSelected = new Set();
      Object.keys(schema).map((currPath: string) => {
        if (currPath.startsWith(path)) {
          tmpSelected.add(currPath);
        }
      });
      return tmpSelected;
    },
    [schema]
  );
  const [selectedPaths, setSelectedPaths] = useRecoilState<Set<string>>(
    fos.selectedPaths
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
      setSelectedPaths(new Set([...finalPaths]));
    }
  }, [activeLabelPaths, setSelectedPaths]);

  const viewStages = useRecoilValue(fos.view);
  const setView = useSetView();
  const [selectedTab, setSelectedTab] = useRecoilState(
    schemaSelectedSettingsTab
  );

  const toggleSelection = useCallback(
    (path: string, checked: boolean) => {
      const subPaths = new Set<string>();
      Object.keys(schema).map((currPath: string) => {
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
        const union = new Set<string>([...selectedPaths, ...subPaths]);
        let parentPaths = [];
        if (currPathSplit.length > 1) {
          parentPaths = [
            path.replace(`.${currPathSplit[currPathSplit.length - 1]}`, ""),
          ];
          union.add(parentPaths[0]);
        }
        setSelectedPaths(union);
      }
    },
    [schema, selectedPaths, setSelectedPaths]
  );

  useEffect(() => {
    if (viewStages?.length) {
      const finalSelectedFields = new Set<string>();
      for (let i = 0; i < viewStages?.length; i++) {
        const view = viewStages[i];
        if (view && view?.["_cls"] === "fiftyone.core.stages.SelectFields") {
          const selectedFields = view?.["kwargs"]?.filter(
            (item) => item[0] === "field_names"
          )[0];
          selectedFields[1].forEach((item) => finalSelectedFields.add(item));
        }
      }
      if (finalSelectedFields.size) {
        const ffff = new Set<string>();
        finalSelectedFields.forEach((p: string) => {
          const subPaths = getSelectedSubPaths(p);
          subPaths.forEach((item: string) => ffff.add(item));
        });
      }
    }
  }, [viewStages]);

  const finalSchema = useMemo(
    () =>
      Object.keys(schema)
        .sort()
        .filter((path) => {
          // TODO
          if (fieldsOnly) {
            return (
              !path?.includes(".") &&
              schema[path]?.searchField?.includes(searchTerm)
            );
          }
          if (!searchTerm) {
            return true;
          } else if (
            searchTerm &&
            schema[path]?.searchField?.includes(searchTerm)
          ) {
            return true;
          }
          return false;
        })
        .map((path: string) => {
          const count = path.split(".")?.length;
          const isSelected = selectedPaths.has(path);
          const pathLabel = path.split(".");
          const pathLabelFinal = pathLabel[pathLabel.length - 1];
          const skip =
            schema[path].ftype === "fiftyone.core.fields.DictField" ||
            schema[path].ftype === "fiftyone.core.fields.Field" ||
            path.includes(".logits") ||
            path.endsWith(".index") ||
            path.endsWith(".bounding_box");

          const disabled =
            path.endsWith(".id") ||
            path === "id" ||
            path === "tags" ||
            path === "filepath" ||
            path === "uniqueness" ||
            path.startsWith("metadata");

          return {
            path,
            count,
            isSelected,
            pathLabelFinal,
            skip,
            disabled,
          };
        })
        .sort((item) => (fieldsOnly ? (item.disabled ? 1 : -1) : 0)),
    [schema, searchTerm, selectedPaths, fieldsOnly]
  );

  const finalSelectedPaths = new Set(
    [...selectedPaths].filter((path) => {
      return !(
        schema[path].ftype === "fiftyone.core.fields.DictField" ||
        schema[path].ftype === "fiftyone.core.fields.Field" ||
        path.includes(".logits") ||
        path.endsWith(".index") ||
        path.endsWith(".bounding_box") ||
        path.endsWith(".detections.confidence")
      );
    })
  );

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
    setSelectedPaths,
    originalSelectedPaths,
    selectedPaths,
    finalSelectedPaths,
  };
}
