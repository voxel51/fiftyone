import { RGB } from "@fiftyone/looker";
import { convertToHex, isValidColor } from "@fiftyone/looker/src/overlays/util";
import { useColorScheme } from "@mui/material";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import {
  ColorScheme,
  State,
  _activeFields,
  activeColorField,
  activePcdSlices,
  currentModalSample,
  dataset as datasetAtom,
  extendedSelection,
  filters,
  groupSlice,
  groupStatistics,
  isUsingSessionColorScheme,
  patching,
  resolveGroups,
  savingFilters,
  selectedFieldsStageState,
  selectedLabels,
  selectedMediaField,
  selectedSamples,
  sessionColorScheme,
  sessionSpaces,
  sidebarGroupsDefinition,
  sidebarMode,
  similarityParameters,
  similaritySorting,
  tagging,
  theme,
} from "../recoil";
import * as viewAtoms from "../recoil/view";
import {
  DEFAULT_APP_COLOR_SCHEME,
  collapseFields,
  viewsAreEqual,
} from "../utils";

export interface StateUpdate {
  colorscale?: RGB[];
  config?: State.Config;
  dataset?: State.Dataset;
  state?: Partial<State.Description>;
}

export type StateResolver =
  | StateUpdate
  | ((t: TransactionInterface_UNSTABLE) => StateUpdate);

const useStateUpdate = (ignoreSpaces = false) => {
  const { setMode } = useColorScheme();
  return useRecoilTransaction_UNSTABLE(
    (t) => (resolve: StateResolver) => {
      const { config, dataset, state } =
        resolve instanceof Function ? resolve(t) : resolve;

      const { get, reset, set } = t;
      if (state) {
        const view = get(viewAtoms.view);
        if (dataset?.stages && !state.view) {
          state.view = dataset.stages;
        }

        if (!viewsAreEqual(view || [], state.view || [])) {
          set(viewAtoms.view, state.view || []);

          reset(extendedSelection);
          reset(similarityParameters);
          reset(filters);
          reset(selectedFieldsStageState);
        }
        set(viewAtoms.viewName, state.viewName || null);
      }
      const viewCls = state?.viewCls || dataset?.viewCls;
      viewCls !== undefined && set(viewAtoms.viewCls, viewCls);

      state?.selected && set(selectedSamples, new Set(state.selected));
      state?.selectedLabels &&
        set(
          selectedLabels,
          Object.fromEntries(
            (state.selectedLabels || []).map(({ labelId, ...data }) => [
              labelId,
              data,
            ])
          )
        );

      if (config && config.theme !== "browser") {
        set(theme, config.theme);
        setMode(config.theme);
      }

      if (state?.spaces) {
        set(sessionSpaces, state.spaces);
      } else if (!ignoreSpaces) {
        reset(sessionSpaces);
      }

      let colorSetting = DEFAULT_APP_COLOR_SCHEME as ColorScheme;
      if (state?.colorScheme) {
        const parsedSetting =
          typeof state.colorScheme === "string"
            ? typeof JSON.parse(state.colorScheme) === "string"
              ? JSON.parse(JSON.parse(state.colorScheme))
              : JSON.parse(state.colorScheme)
            : state.colorScheme;

        let colorPool = parsedSetting["color_pool"];
        colorPool =
          Array.isArray(colorPool) && colorPool?.length > 0
            ? colorPool
            : DEFAULT_APP_COLOR_SCHEME.colorPool;
        colorPool =
          colorPool.filter((c) => isValidColor(c)).length > 0
            ? colorPool
                .filter((c) => isValidColor(c))
                .map((c) => convertToHex(c))
            : DEFAULT_APP_COLOR_SCHEME.colorPool;
        colorSetting = {
          colorPool,
          fields:
            parsedSetting["fields"] ?? parsedSetting?.fields?.length > 0
              ? parsedSetting.fields
              : [],
        } as ColorScheme;
        set(sessionColorScheme, colorSetting);
        set(isUsingSessionColorScheme, true);
      } else if (!ignoreSpaces) {
        reset(activeColorField);
        reset(isUsingSessionColorScheme);
        set(sessionColorScheme, colorSetting);
      }

      if (dataset) {
        dataset.brainMethods = Object.values(dataset.brainMethods || {});
        dataset.evaluations = Object.values(dataset.evaluations || {});
        dataset.savedViews = Object.values(dataset.savedViews || []);
        dataset.sampleFields = collapseFields(dataset.sampleFields);
        dataset.frameFields = collapseFields(dataset.frameFields);
        const previousDataset = get(datasetAtom);

        const currentSidebar = get(sidebarGroupsDefinition(false));
        let groups = resolveGroups(
          dataset.sampleFields,
          dataset.frameFields,
          dataset.appConfig.sidebarGroups,
          currentSidebar
        );

        if (
          !previousDataset ||
          previousDataset.id !== dataset.id ||
          dataset.groupSlice != previousDataset.groupSlice
        ) {
          if (dataset?.name !== previousDataset?.name) {
            reset(sidebarMode(false));
            groups = resolveGroups(
              dataset.sampleFields,
              dataset.frameFields,
              dataset.appConfig.sidebarGroups
            );
          }
          reset(_activeFields({ modal: false }));
          reset(selectedFieldsStageState);

          set(groupSlice(false), dataset.groupSlice);
          reset(groupStatistics(false));

          reset(similarityParameters);

          const getMediaPathWithOverride = (f: string) =>
            dataset.sampleFields.map((field) => field.name).includes(f)
              ? f
              : "filepath";

          set(
            selectedMediaField(false),
            getMediaPathWithOverride(dataset?.appConfig?.gridMediaField) ||
              "filepath"
          );
          set(
            selectedMediaField(true),
            getMediaPathWithOverride(dataset?.appConfig?.modalMediaField) ||
              "filepath"
          );
          reset(extendedSelection);
          reset(filters);
          reset(activePcdSlices);

          // todo: find a way to reset atom family or key by dataset name
          // reset(dynamicGroupSamplesStoreMap());
          // reset(viewAtoms.dynamicGroupCurrentElementIndex);
        }

        if (JSON.stringify(groups) !== JSON.stringify(currentSidebar)) {
          set(sidebarGroupsDefinition(false), groups);
        }
        set(datasetAtom, dataset);
      }

      set(currentModalSample, null);

      [true, false].forEach((i) =>
        [true, false].forEach((j) =>
          set(tagging({ modal: i, labels: j }), false)
        )
      );
      set(patching, false);
      set(similaritySorting, false);
      set(savingFilters, false);
    },
    []
  );
};

export default useStateUpdate;
