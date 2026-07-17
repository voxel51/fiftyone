import { useOperators } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue, useRecoilState } from "recoil";
import { pluginsLoaderAtom } from "./state";
import { loadPlugins } from "..";

/**
 * A react hook for loading the plugin system.
 */
export default function usePlugins() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [state, setState] = useRecoilState(pluginsLoaderAtom);
  const notify = fos.useNotification();
  const {
    ready: operatorsReady,
    hasError: operatorHasError,
    isLoading: operatorIsLoading,
  } = useOperators(datasetName === null);

  useEffect(() => {
    loadPlugins()
      .catch(() => {
        notify({
          msg:
            "Failed to initialize Python plugins. You may not be able to use" +
            " panels, operators, and other artifacts of plugins installed.",
          variant: "error",
        });
        setState("error");
      })
      .then(() => {
        setState("ready");
      });
  }, [setState]);

  return {
    isLoading: state === "loading" || operatorIsLoading,
    hasError: state === "error" || operatorHasError,
    ready: state === "ready" && operatorsReady,
  };
}
