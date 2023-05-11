import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { buildSchema } from "@fiftyone/state";
import {
  DICT_FIELD,
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
  useSetRecoilState,
} from "recoil";

export const TAB_OPTIONS_MAP = {
  SELECTION: "Selection",
  FILTER_RULE: "Filter rule",
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
const disabledField = (path: string, ftype: string, subfield: string) => {
  return (
    path === "tags" ||
    path === "filepath" ||
    (ftype === OBJECT_ID_FIELD && path === "id") ||
    path.startsWith("metadata") ||
    path.endsWith("frames.frame_number") ||
    ftype === FRAME_NUMBER_FIELD
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
        const schema = await getPromise(schemaState);

        const greenPaths = [...newPaths].filter(
          (path) =>
            path &&
            (viewSchema?.[path]?.ftype || schema?.[path]?.ftype) &&
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

        const greenPaths = [...newPaths]
          .filter(
            (path) =>
              !!path &&
              !skipFiled(
                path,
                viewSchema?.[path]?.ftype || schema?.[path]?.ftype
              ) &&
              !disabledField(
                path,
                viewSchema?.[path]?.ftype || schema?.[path]?.ftype,
                viewSchema?.[path]?.subfield || schema?.[path]?.subfield
              )
          )
          .map((path) => mapping?.[path] || path);

        setSelf(new Set(greenPaths));
      });
    },
  ],
});
export const schemaState = atom({
  key: "schemaState",
  default: [],
});

export const viewSchemaState = atom({
  key: "viewSchemaState",
  default: null,
});
export const showMetadataState = atom({
  key: "showMetadataState",
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
  const setSelectedFieldsStage = useRecoilCallback(
    ({ snapshot, set }) =>
      async (value) => {
        set(selectedFieldsStageState, value);

        // router is loaded only in OSS
        if (router.loaded) return;
        const view = await snapshot.getPromise(fos.view);
        const datasetName = await snapshot.getPromise(fos.datasetName);
        const subscription = await snapshot.getPromise(fos.stateSubscription);
        setView({
          variables: {
            view: value ? [...view, value] : view,
            datasetName,
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
    [setView, router]
  );

  const setViewSchema = useSetRecoilState(viewSchemaState);
  const [searchTerm, setSearchTerm] = useRecoilState<string>(schemaSearchTerm);
  const [searchResults, setSearchResults] = useRecoilState(schemaSearchRestuls);

  const dataset = useRecoilValue(fos.dataset);
  const [schema, setSchema] = useRecoilState(schemaState);
  useEffect(() => {
    if (dataset) {
      setSchema(dataset ? buildSchema(dataset, true) : []);
    }
  }, [dataset]);

  const [allFieldsChecked, setAllFieldsChecked] = useRecoilState(
    allFieldsCheckedState
  );

  const [affectedPathCount, setAffectedPathCount] = useRecoilState(
    affectedPathCountState
  );

  const [fieldsOnly, setFieldsOnly] = useRecoilState<boolean>(schemaFiledsOnly);

  const allPaths = schema ? Object.keys(schema) : [];
  const vStages = useRecoilValue(fos.view);
  const [data, refetch] = useRefetchableFragment<
    foq.viewSchemaFragmentQuery,
    foq.viewSchemaFragmentQuery$data
  >(foq.viewSchema, null);

  useEffect(() => {
    if (dataset?.name) {
      refetch(
        { name: dataset?.name, viewStages: vStages || [] },
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
  }, [vStages]);
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

  const [selectedPaths, setSelectedPaths] = useRecoilState<Set<string>>(
    selectedPathsState({ allPaths: [] })
  );

  useEffect(() => {
    if (selectedTab === TAB_OPTIONS_MAP.SELECTION) {
      setFieldsOnly(true);
    }
  }, [selectedTab]);

  const [finalSchema] = useMemo(() => {
    let tmpSchema = {};
    if (dataset.mediaType === "video") {
      Object.keys(viewSchema).forEach((fieldPath) => {
        tmpSchema[`frames.${fieldPath}`] = viewSchema[fieldPath];
      });
      Object.keys(schema).forEach((fieldPath) => {
        tmpSchema[fieldPath] = schema[fieldPath];
      });
    } else {
      tmpSchema = viewSchema;
    }

    tmpSchema = keyBy(tmpSchema, "path");
    const resSchema = Object.keys(tmpSchema)
      .sort()
      .filter((path) => {
        if (path === "undefined") return false;
        if (selectedTab === TAB_OPTIONS_MAP.FILTER_RULE) {
          return searchResults.includes(path);
        }
        return true;
      })
      .map((path: string) => {
        const pathLabel = path.split(".");
        const count = pathLabel?.length;
        const pathLabelFinal =
          dataset.mediaType === "video" && viewSchema?.[path]
            ? `frames.${pathLabel[pathLabel.length - 1]}`
            : pathLabel[pathLabel.length - 1];

        const ftype = tmpSchema[path].ftype;
        const skip = skipFiled(path, ftype);
        const disabled = disabledField(path, ftype, tmpSchema[path].subfield);

        const fullPath =
          dataset.mediaType === "video" && viewSchema?.[path]
            ? `frames.${path}`
            : path;

        const isSelected = selectedPaths.has(fullPath);

        return {
          path,
          count,
          isSelected: isSelected || disabled,
          pathLabelFinal,
          skip,
          disabled,
          info: tmpSchema[path].info,
          description: tmpSchema[path].description,
          name: tmpSchema[path].name,
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
  const getSubPaths = useCallback(
    (path: string) => {
      const subPaths = new Set<string>();
      subPaths.add(getPath(path));
      Object.keys(mergedSchema).forEach((currPath: string) => {
        if (
          currPath.startsWith(path + ".") &&
          !skipFiled(currPath, mergedSchema?.[currPath]?.ftype) &&
          !disabledField(
            currPath,
            mergedSchema?.[currPath]?.ftype,
            mergedSchema?.[currPath]?.subfield
          )
        ) {
          subPaths.add(getPath(currPath));
        }
      });
      return subPaths;
    },
    [mergedSchema]
  );

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

  useEffect(() => {
    if (viewPaths.length && !selectedPaths.size) {
      setSelectedPaths(new Set([...viewPaths, ...Object.keys(schema)]));
    }
  }, [schema]);

  // toggle field selection
  const toggleSelection = useCallback(
    (path: string, checked: boolean) => {
      const pathAndSubPaths = getSubPaths(path);
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

  // select and unselect all
  const setAllFieldsCheckedWrapper = useCallback(
    (val) => {
      if (allPaths?.length) {
        setAllFieldsChecked(val);
        const allThePaths = finalSchema.map((ff) => ff.path);
        const newSelectedPaths = new Set(val ? allThePaths : []);
        setSelectedPaths(newSelectedPaths);
      }
    },
    [finalSchema, allPaths, vPaths]
  );

  // updates the affected fields count
  useEffect(() => {
    if (viewSchema && schema) {
      const diff = Object.keys(viewSchema).length - Object.keys(schema).length;
      if (diff !== affectedPathCount && diff >= 0) {
        setAffectedPathCount(diff);
      }
    }
  }, [viewSchema, schema]);

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
    mediatType: dataset.mediaType,
    dataset,
  };
}
