import { isPrimitiveString } from "@fiftyone/utilities";
import { useCallback, useEffect, useState } from "react";
import { useSetRecoilState } from "recoil";
import { registerBuiltInOperators } from "./built-in-operators";
import { OperatorScope } from "./constants";
import { setOperatorsRuntime } from "@fiftyone/plugins/src/Runtime/operators";
import { useOperatorPlacementsResolver } from "./hooks";
import { executeOperatorsForEvent, loadOperatorsFromServer } from "./operators";
import registerPanel from "./Panel/register";
import {
  availableOperatorsRefreshCount,
  operatorsInitializedAtom,
  operatorPlacementsAtom,
  useSetActiveScope,
} from "./state";
import { unregisterComponent } from "@fiftyone/plugins/src/registry";

let startupOperatorsExecuted = false;
const registeredPanels = new Set<string>();
let latestOperatorsLoad = 0;

/**
 * Fetch operator/panel definitions for `datasetName` and register any not
 * already known. Shared by the mount-time loader below and by
 * `useRefreshOperators`, which needs the same fetch-and-register step
 * without `loadOperators`' one-time dataset-open/startup side effects.
 */
async function fetchAndRegisterOperators(datasetName: string | null) {
  registerBuiltInOperators();
  const panels = await loadOperatorsFromServer(datasetName);
  if (!panels) return false;
  const panelNames = new Set(panels.map((panel) => panel.panel_name));
  for (const panelName of registeredPanels) {
    if (!panelNames.has(panelName)) {
      unregisterComponent(panelName);
      registeredPanels.delete(panelName);
    }
  }
  for (const panel of panels) {
    if (!registeredPanels.has(panel.panel_name)) {
      registeredPanels.add(panel.panel_name);
      registerPanel(panel);
    }
  }
  return true;
}

async function loadOperators(datasetName: string | null) {
  const loaded = await fetchAndRegisterOperators(datasetName);
  if (!loaded) return false;
  if (datasetName) {
    executeOperatorsForEvent("onDatasetOpen");
  }
  if (!startupOperatorsExecuted) {
    executeOperatorsForEvent("onStartup");
    startupOperatorsExecuted = true;
  }
  return true;
}

/**
 * Load built-in and installed JavaScript and Python operators and queue all
 *  start-up operators for execution.
 */
export function useOperators(
  datasetName: string | null,
  datasetLess?: boolean,
) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<Error | null>(null);
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount,
  );
  const setOperatorsInitialized = useSetRecoilState(operatorsInitializedAtom);
  const setOperatorPlacements = useSetRecoilState(operatorPlacementsAtom);
  const { initialized } = useOperatorPlacementsResolver();

  useEffect(() => {
    const request = ++latestOperatorsLoad;
    setState("loading");
    setError(null);
    setOperatorsInitialized(false);
    setOperatorPlacements([]);
    if (isPrimitiveString(datasetName) || datasetLess) {
      loadOperators(datasetName)
        .then((loaded) => {
          if (request !== latestOperatorsLoad || !loaded) return;
          // trigger force refresh
          setAvailableOperatorsRefreshCount((count) => count + 1);
          setState("ready");
          setOperatorsInitialized(true);
        })
        .catch((error) => {
          if (request !== latestOperatorsLoad) return;
          setState("error");
          setError(error);
        });
    }
    return () => {
      if (request === latestOperatorsLoad) latestOperatorsLoad += 1;
    };
  }, [
    datasetLess,
    datasetName,
    setAvailableOperatorsRefreshCount,
    setOperatorsInitialized,
    setOperatorPlacements,
  ]);

  return {
    ready: state === "ready" && (initialized || datasetLess),
    hasError: state === "error",
    isLoading: state === "loading",
    error,
    state,
  };
}

setOperatorsRuntime((activeScope, datasetName, datasetLess) => {
  useSetActiveScope(activeScope || OperatorScope.DATASET_SAMPLES_GRID);
  return useOperators(datasetName ?? null, datasetLess ?? false);
});

/**
 * Re-fetches and registers operators/panels, then bumps the refresh count
 * so mounted consumers see anything new without a reload. Skips
 * `loadOperators`' one-time `onDatasetOpen`/`onStartup` side effects.
 */
export function useRefreshOperators() {
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount,
  );

  return useCallback(
    async (datasetName: string) => {
      await fetchAndRegisterOperators(datasetName);
      setAvailableOperatorsRefreshCount((count) => count + 1);
    },
    [setAvailableOperatorsRefreshCount],
  );
}
