import { datasetName as datasetNameAtom } from "@fiftyone/state";
import { isPrimitiveString } from "@fiftyone/utilities";
import { useEffect, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { registerBuiltInOperators } from "./built-in-operators";
import { useOperatorPlacementsResolver } from "./hooks";
import { loadOperatorsFromServer } from "./operators";
import {
  availableOperatorsRefreshCount,
  operatorsInitializedAtom,
} from "./state";

async function loadOperators(datasetName: string) {
  registerBuiltInOperators();
  await loadOperatorsFromServer(datasetName);
}

/**
 * Load built-in and installed JavaScript and Python operators and queue all
 *  start-up operators for execution.
 */
export function useOperators(datasetLess?: boolean) {
  const [ready, setReady] = useState(false);
  const datasetName = useRecoilValue(datasetNameAtom);
  const setAvailableOperatorsRefreshCount = useSetRecoilState(
    availableOperatorsRefreshCount
  );
  const setOperatorsInitialized = useSetRecoilState(operatorsInitializedAtom);
  const { initialized } = useOperatorPlacementsResolver();

  useEffect(() => {
    if (isPrimitiveString(datasetName) || datasetLess) {
      loadOperators(datasetName).then(() => {
        // trigger force refresh
        setAvailableOperatorsRefreshCount((count) => count + 1);
        setReady(true);
        setOperatorsInitialized(true);
      });
    }
  }, [
    datasetLess,
    datasetName,
    setAvailableOperatorsRefreshCount,
    setOperatorsInitialized,
  ]);

  return ready && (initialized || datasetLess);
}
