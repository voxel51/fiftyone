import { useEffect } from "react";
import { registerBuiltInOperators } from "./built-in-operators";
import { executeStartupOperators, loadOperatorsFromServer } from "./operators";
import { isPrimitiveString } from "@fiftyone/utilities";
import { useSetRecoilState, useRecoilValue } from "recoil";
import { datasetName as datasetNameAtom } from "@fiftyone/state";
import { availableOperatorsRefreshCount } from "./state";

let startupOperatorsExecuted = false;

async function loadOperators(datasetName: string) {
  registerBuiltInOperators();
  await loadOperatorsFromServer(datasetName);
  if (!startupOperatorsExecuted) {
    executeStartupOperators();
    startupOperatorsExecuted = true;
  }
}

/**
 * Load built-in and installed JavaScript and Python operators and queue all
 *  start-up operators for execution.
 */
export function useOperators(datasetLess?: boolean) {
  const datasetName = useRecoilValue(datasetNameAtom);
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount
  );

  useEffect(() => {
    if (isPrimitiveString(datasetName) || datasetLess) {
      loadOperators(datasetName).then(() => {
        // trigger force refresh
        setAvailableOperatorsRefreshCount((count) => count + 1);
      });
    }
  }, [datasetLess, datasetName, setAvailableOperatorsRefreshCount]);
}
