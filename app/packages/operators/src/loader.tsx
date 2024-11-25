import {
  datasetHeadName,
  datasetName as datasetNameAtom,
} from "@fiftyone/state";
import { isPrimitiveString } from "@fiftyone/utilities";
import { useEffect, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { registerBuiltInOperators } from "./built-in-operators";
import { useOperatorPlacementsResolver } from "./hooks";
import { executeOperatorsForEvent, loadOperatorsFromServer } from "./operators";
import {
  availableOperatorsRefreshCount,
  operatorsInitializedAtom,
} from "./state";

let startupOperatorsExecuted = false;

async function loadOperators(datasetName: string, headName?: string) {
  registerBuiltInOperators();
  await loadOperatorsFromServer(datasetName, headName);
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
  const headName = useRecoilValue(datasetHeadName);
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount
  );
  const setOperatorsInitialized = useSetRecoilState(operatorsInitializedAtom);
  const { initialized } = useOperatorPlacementsResolver();

  useEffect(() => {
    if (isPrimitiveString(datasetName) || datasetLess) {
      loadOperators(datasetName, headName)
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
    headName,
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
