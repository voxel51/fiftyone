import { RGB } from "@fiftyone/looker";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import {
  modal,
  sidebarGroupsDefinition,
  State,
  tagging,
  _activeFields,
  dataset as datasetAtom,
  resolveGroups,
  filters,
  colorPool as colorPoolAtom,
  selectedLabels,
  appConfig,
  colorscale as colorscaleAtom,
  selectedSamples,
  patching,
  similaritySorting,
  savingFilters,
  groupSlice,
  similarityParameters,
  extendedSelection,
  selectedMediaField,
  sidebarMode,
  groupStatistics,
  theme,
} from "../recoil";
import { useColorScheme } from "@mui/material";

import * as viewAtoms from "../recoil/view";
import { collapseFields, viewsAreEqual } from "../utils";

interface StateUpdate {
  colorscale?: RGB[];
  config?: State.Config;
  dataset?: State.Dataset;
  state?: Partial<State.Description>;
}

export type StateResolver =
  | StateUpdate
  | ((t: TransactionInterface_UNSTABLE) => StateUpdate);

const useStateUpdate = () => {
  const { setMode } = useColorScheme();

  return useRecoilTransaction_UNSTABLE(
    (t) => (resolve: StateResolver) => {
      const { dataset, state } =
        resolve instanceof Function ? resolve(t) : resolve;

      const { get, reset, set } = t;

      if (state) {
        const view = get(viewAtoms.view);

        if (!viewsAreEqual(view || [], state.view || [])) {
          set(viewAtoms.view, state.view || []);
          reset(extendedSelection);
          reset(similarityParameters);
          reset(filters);
        }
      }

      state?.viewCls !== undefined && set(viewAtoms.viewCls, state.viewCls);

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

      if (dataset) {
        dataset.brainMethods = Object.values(dataset.brainMethods || {});
        dataset.evaluations = Object.values(dataset.evaluations || {});
        dataset.sampleFields = collapseFields(dataset.sampleFields);
        dataset.frameFields = collapseFields(dataset.frameFields);
        const previousDataset = get(datasetAtom);

        const currentSidebar = get(sidebarGroupsDefinition(false));
        let groups = resolveGroups(dataset, currentSidebar);

        if (
          !previousDataset ||
          previousDataset.id !== dataset.id ||
          dataset.groupSlice !== previousDataset.groupSlice
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
          set(
            selectedMediaField(false),
            dataset?.appConfig?.gridMediaField || "filepath"
          );
          set(
            selectedMediaField(true),
            dataset?.appConfig?.modalMediaField || "filepath"
          );
          reset(extendedSelection);
          reset(filters);
        }

        if (JSON.stringify(groups) !== JSON.stringify(currentSidebar)) {
          set(sidebarGroupsDefinition(false), groups);
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
