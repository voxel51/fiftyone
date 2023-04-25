import { RGB } from "@fiftyone/looker";
import { useColorScheme } from "@mui/material";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import {
  dataset as datasetAtom,
  extendedSelection,
  filters,
  groupSlice,
  groupStatistics,
  modal,
  patching,
  resolveGroups,
  savingFilters,
  selectedLabels,
  selectedMediaField,
  selectedSamples,
  sessionSpaces,
  sidebarGroupsDefinition,
  sidebarMode,
  similarityParameters,
  similaritySorting,
  State,
  tagging,
  theme,
  _activeFields,
  sessionColorScheme,
  customizeColors,
  ColorScheme,
  ColorSetting,
} from "../recoil";

import * as viewAtoms from "../recoil/view";
import { collapseFields, viewsAreEqual } from "../utils";

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

      if (dataset) {
        dataset.brainMethods = Object.values(dataset.brainMethods || {});
        dataset.evaluations = Object.values(dataset.evaluations || {});
        dataset.savedViews = Object.values(dataset.savedViews || []);
        dataset.sampleFields = collapseFields(dataset.sampleFields);
        dataset.frameFields = collapseFields(dataset.frameFields);
        const previousDataset = get(datasetAtom);

        const currentSidebar = get(sidebarGroupsDefinition(false));
        let groups = resolveGroups(dataset, currentSidebar);

        if (
          !previousDataset ||
          previousDataset.id !== dataset.id ||
          dataset.groupSlice != previousDataset.groupSlice
        ) {
          if (dataset?.name !== previousDataset?.name) {
            reset(sidebarMode(false));
            groups = resolveGroups(dataset);
          }
          reset(_activeFields({ modal: false }));
          let slice = dataset.groupSlice;

          if (dataset.groupMediaTypes[slice] === "pcd") {
            slice = dataset.defaultGroupSlice;
          }

          set(groupSlice(false), slice);
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
        }

        if (JSON.stringify(groups) !== JSON.stringify(currentSidebar)) {
          set(sidebarGroupsDefinition(false), groups);
        }

        if (state?.colorScheme) {
          set(sessionColorScheme, state.colorScheme as ColorScheme);
        }

        set(datasetAtom, dataset);
      }

      set(modal, null);

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
