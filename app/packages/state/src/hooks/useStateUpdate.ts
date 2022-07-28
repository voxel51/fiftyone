import { RGB } from "@fiftyone/looker";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import {
  aggregationsTick,
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
} from "../recoil";

import * as viewAtoms from "../recoil/view";
import { viewsAreEqual } from "../utils";

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
  return useRecoilTransaction_UNSTABLE(
    (t) => (resolve: StateResolver) => {
      const { colorscale, config, dataset, state } =
        resolve instanceof Function ? resolve(t) : resolve;

      const { get, reset, set } = t;

      if (state) {
        const view = get(viewAtoms.view);

        if (!viewsAreEqual(view, state.view || [])) {
          set(viewAtoms.view, state.view || []);
          set(filters, {});
        }
      }

      colorscale !== undefined && set(colorscaleAtom, colorscale);

      config !== undefined && set(appConfig, config);
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

      const colorPool = get(colorPoolAtom);
      if (
        config &&
        JSON.stringify(config.colorPool) !== JSON.stringify(colorPool)
      ) {
        set(colorPoolAtom, config.colorPool);
      }

      if (dataset) {
        dataset.brainMethods = Object.values(dataset.brainMethods || {});
        dataset.evaluations = Object.values(dataset.evaluations || {});

        const groups = resolveGroups(dataset);
        const currentSidebar = get(sidebarGroupsDefinition(false));

        if (JSON.stringify(groups) !== JSON.stringify(currentSidebar)) {
          set(sidebarGroupsDefinition(false), groups);
          set(aggregationsTick, get(aggregationsTick) + 1);
        }

        const previousDataset = get(datasetAtom);
        if (!previousDataset || previousDataset.id !== dataset.id) {
          reset(_activeFields({ modal: false }));
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
