import { datasetName as datasetNameAtom } from "@fiftyone/state";
import { isPrimitiveString } from "@fiftyone/utilities";
import { useCallback, useEffect, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { registerBuiltInOperators } from "./built-in-operators";
import { useOperatorPlacementsResolver } from "./hooks";
import { executeOperatorsForEvent, loadOperatorsFromServer } from "./operators";
import registerPanel from "./Panel/register";
import {
  availableOperatorsRefreshCount,
  operatorsInitializedAtom,
} from "./state";

let startupOperatorsExecuted = false;
const registeredPanels = new Set<string>();

/**
 * Fetch operator/panel definitions for `datasetName` and register any not
 * already known. Shared by the mount-time loader below and by
 * `useRefreshOperators`, which needs the same fetch-and-register step
 * without `loadOperators`' one-time dataset-open/startup side effects.
 */
async function fetchAndRegisterOperators(datasetName: string) {
  registerBuiltInOperators();
  const panels = await loadOperatorsFromServer(datasetName);
  for (const panel of panels) {
    if (!registeredPanels.has(panel.panel_name)) {
      registeredPanels.add(panel.panel_name);
      registerPanel(panel);
    }
  }
}

async function loadOperators(datasetName: string) {
  await fetchAndRegisterOperators(datasetName);
  executeOperatorsForEvent("onDatasetOpen");
  if (!startupOperatorsExecuted) {
    executeOperatorsForEvent("onStartup");
    startupOperatorsExecuted = true;
  }
}

/**
 * Load built-in and installed JavaScript and Python operators and queue all
 *  start-up operators for execution.
 */
export function useOperators(datasetLess?: boolean) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<Error | null>(null);
  const datasetName = useRecoilValue(datasetNameAtom);
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount,
  );
  const setOperatorsInitialized = useSetRecoilState(operatorsInitializedAtom);
  const { initialized } = useOperatorPlacementsResolver();

  useEffect(() => {
    if (isPrimitiveString(datasetName) || datasetLess) {
      loadOperators(datasetName)
        .then(() => {
          // trigger force refresh
          setAvailableOperatorsRefreshCount((count) => count + 1);
          setState("ready");
          setOperatorsInitialized(true);
        })
        .catch((error) => {
          setState("error");
          setError(error);
        });
    }
  }, [
    datasetLess,
    datasetName,
    setAvailableOperatorsRefreshCount,
    setOperatorsInitialized,
  ]);

  return {
    ready: state === "ready" && (initialized || datasetLess),
    hasError: state === "error",
    isLoading: state === "loading",
    error,
    state,
  };
}

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
