import { isPrimitiveString } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSetRecoilState } from "recoil";
import { registerBuiltInOperators } from "./built-in-operators";
import { PluginScope } from "@fiftyone/plugins/src/PluginScope";
import {
  setOperatorsRuntime,
  useOperatorsLoaderState,
} from "@fiftyone/plugins/src/Runtime";
import { unregisterComponent } from "@fiftyone/plugins/src/registry";
import { useOperatorPlacementsResolver } from "./hooks";
import {
  executeOperatorsForEvent,
  loadOperatorsFromServer,
  StaleOperatorsRequestError,
} from "./operators";
import registerPanel from "./Panel/register";
import {
  availableOperatorsRefreshCount,
  operatorPlacementsAtom,
  useSetActiveScope,
} from "./state";

let startupOperatorsExecuted = false;
const registeredPanels = new Set<string>();

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
  const [state, setState] = useOperatorsLoaderState();
  const [error, setError] = useState<Error | null>(null);
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount,
  );
  const setOperatorPlacements = useSetRecoilState(operatorPlacementsAtom);
  const { initialized } = useOperatorPlacementsResolver();
  const latestOperatorsLoad = useRef(0);

  useEffect(() => {
    const request = ++latestOperatorsLoad.current;
    setState("loading");
    setError(null);
    setOperatorPlacements([]);
    if (isPrimitiveString(datasetName) || datasetLess) {
      const load = () =>
        loadOperators(datasetName)
          .then((loaded) => {
            if (request !== latestOperatorsLoad.current) return;
            if (!loaded) {
              setState("error");
              return;
            }
            // trigger force refresh
            setAvailableOperatorsRefreshCount((count) => count + 1);
            setState("ready");
          })
          .catch((error) => {
            if (request !== latestOperatorsLoad.current) return;
            if (error instanceof StaleOperatorsRequestError) {
              load();
              return;
            }
            setState("error");
            setError(error);
          });
      load();
    }
    return () => {
      if (request === latestOperatorsLoad.current)
        latestOperatorsLoad.current += 1;
    };
  }, [
    datasetLess,
    datasetName,
    setAvailableOperatorsRefreshCount,
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

function useOperatorsRuntime(activeScope, datasetName, datasetLess) {
  useSetActiveScope(activeScope || PluginScope.DATASET_SAMPLES_GRID, true);
  useOperators(datasetName ?? null, datasetLess ?? false);
}

setOperatorsRuntime(useOperatorsRuntime);

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
