import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useSetRecoilState } from "recoil";
import { pluginsLoaderAtom, usePluginsStatus } from "./state";
import { loadPlugins } from "../loadPlugins";

/**
 * A react hook for loading the plugin system.
 */
export default function usePlugins() {
  const setState = useSetRecoilState(pluginsLoaderAtom);
  const notify = fos.useNotification();

  useEffect(() => {
    loadPluginsOnce()
      .then(() => {
        setState("ready");
      })
      .catch(() => {
        notify({
          msg:
            "Failed to initialize Python plugins. You may not be able to use" +
            " panels, operators, and other artifacts of plugins installed.",
          variant: "error",
        });
        setState("error");
      });
  }, [notify, setState]);

  return usePluginsStatus();
}

let pluginsLoadPromise: Promise<void> | undefined;

function loadPluginsOnce() {
  if (!pluginsLoadPromise) {
    pluginsLoadPromise = loadPlugins().catch((error) => {
      pluginsLoadPromise = undefined;
      throw error;
    });
  }

  return pluginsLoadPromise;
}
