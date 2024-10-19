import * as fos from "@fiftyone/state";
import {
  atom,
  selector,
  selectorFamily,
  RecoilState,
  RecoilValueReadOnly,
} from "recoil";
import { listLocalAndRemoteOperators } from "./operators";
import { Places } from "../types";

type PromptingOperator = {
  operatorName: string;
  params: Record<string, any>;
  options?: Record<string, any>;
  initialParams?: Record<string, any>;
} | null;

type OperatorConfig = {
  label: string;
  name: string;
  value: string; // Corrected to 'value'
  description: string;
  unlisted: boolean;
  canExecute: boolean;
  pluginName: string;
  _builtIn: boolean;
  icon?: string;
  darkIcon?: string;
  lightIcon?: string;
};

type GlobalContext = {
  datasetName: string;
  view: any;
  extended: any;
  filters: any;
  selectedSamples: any;
  selectedLabels: any;
  viewName: any;
  extendedSelection: any;
  groupSlice: any;
  queryPerformance: boolean;
};

type OperatorPlacement = {
  placement: { place: Places };
  operator: { config: { canExecute: boolean } };
};

//
// Atoms
//

export const promptingOperatorState: RecoilState<PromptingOperator> = atom({
  key: "promptingOperator",
  default: null,
});

export const recentlyUsedOperatorsState: RecoilState<string[]> = atom({
  key: "recentlyUsedOperators",
  default: [],
  effects: [
    fos.getBrowserStorageEffectForKey("recently-used-operators", {
      useJsonSerialization: true,
    }),
  ],
});

export const operatorBrowserVisibleState: RecoilState<boolean> = atom({
  key: "operatorBrowserVisibleState",
  default: false,
});

export const operatorIOState: RecoilState<{ visible: boolean }> = atom({
  key: "operatorIOState",
  default: { visible: false },
});

export const operatorPlacementsAtom: RecoilState<OperatorPlacement[]> = atom({
  key: "operatorPlacementsAtom",
  default: [],
});

export const operatorChoiceState: RecoilState<string | null> = atom({
  key: "operatorChoiceState",
  default: null,
});

export const availableOperatorsRefreshCount: RecoilState<number> = atom({
  key: "availableOperatorsRefreshCount",
  default: 0,
});

export const operatorsInitializedAtom: RecoilState<boolean> = atom({
  key: "operatorsInitializedAtom",
  default: false,
});

export const activePanelsEventCountAtom: RecoilState<Map<string, number>> =
  atom({
    key: "activePanelsEventCountAtom",
    default: new Map<string, number>(),
  });

//
// Selector Definitions
//

export const showOperatorPromptSelector: RecoilValueReadOnly<boolean> =
  selector({
    key: "showOperatorPrompt",
    get: ({ get }) => {
      return !!get(promptingOperatorState);
    },
  });

export const globalContextSelector: RecoilValueReadOnly<GlobalContext> =
  selector({
    key: "globalContext",
    get: ({ get }) => {
      const datasetName = get(fos.datasetName);
      const view = get(fos.view);
      const extended = get(fos.extendedStages);
      const filters = get(fos.filters);
      const selectedSamples = get(fos.selectedSamples);
      const selectedLabels = get(fos.selectedLabels);
      const viewName = get(fos.viewName);
      const extendedSelection = get(fos.extendedSelection);
      const groupSlice = get(fos.groupSlice);
      const queryPerformance = typeof get(fos.lightningThreshold) === "number";

      return {
        datasetName,
        view,
        extended,
        filters,
        selectedSamples,
        selectedLabels,
        viewName,
        extendedSelection,
        groupSlice,
        queryPerformance,
      };
    },
  });

export const currentOperatorParamsSelector = selectorFamily<
  Record<string, any>,
  string
>({
  key: "currentOperatorParamsSelector",
  get:
    () =>
    ({ get }) => {
      const promptingOperator = get(promptingOperatorState);
      return promptingOperator ? promptingOperator.params : {};
    },
});

export const currentContextSelector = selectorFamily<
  GlobalContext & { params: Record<string, any> },
  string
>({
  key: "currentContextSelector",
  get:
    (operatorName) =>
    ({ get }) => {
      const globalContext = get(globalContextSelector);
      const params = get(currentOperatorParamsSelector(operatorName));
      return { ...globalContext, params };
    },
});

export const availableOperators: RecoilValueReadOnly<OperatorConfig[]> =
  selector({
    key: "availableOperators",
    get: ({ get }) => {
      get(availableOperatorsRefreshCount); // Triggers force refresh manually
      return listLocalAndRemoteOperators().allOperators.map((operator) => ({
        label: operator.label,
        name: operator.name,
        value: operator.uri, // Changed from 'uri' to 'value'
        description: operator.config.description,
        unlisted: operator.unlisted,
        canExecute: operator.config.canExecute,
        pluginName: operator.pluginName,
        _builtIn: operator._builtIn,
        icon: operator.config.icon,
        darkIcon: operator.config.darkIcon,
        lightIcon: operator.config.lightIcon,
      }));
    },
  });

export const operatorPaletteOpened: RecoilValueReadOnly<boolean> = selector({
  key: "operatorPaletteOpened",
  get: ({ get }) => {
    return (
      get(showOperatorPromptSelector) ||
      get(operatorBrowserVisibleState) ||
      get(operatorIOState).visible
    );
  },
});

export const operatorBrowserChoices = selector({
  key: "operatorBrowserChoices",
  get: ({ get }) => {
    const allChoices = get(availableOperators);
    const query = get(fos.operatorBrowserQueryState) as string;
    let results = [...allChoices];
    results = results.filter(({ unlisted }) => !unlisted);
    if (query && query.length > 0) {
      results = filterChoicesByQuery(query, results);
    }
    return sortResults(results, get(recentlyUsedOperatorsState));
  },
});

export const operatorDefaultChoice: RecoilValueReadOnly<string | null> =
  selector({
    key: "operatorDefaultChoice",
    get: ({ get }) => {
      const choices = get(operatorBrowserChoices);
      const firstOperatorName = choices?.[0]?.value;
      return firstOperatorName || null;
    },
  });

export const placementsForPlaceSelector = selectorFamily<
  OperatorPlacement[],
  Places
>({
  key: "operatorsForPlaceSelector",
  get:
    (place) =>
    ({ get }) => {
      const placements = get(operatorPlacementsAtom);
      return placements
        .filter(
          (p) => p.placement.place === place && p.operator?.config?.canExecute
        )
        .map(({ placement, operator }) => ({ placement, operator }));
    },
});
