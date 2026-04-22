import { useOperators } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import * as fou from "@fiftyone/utilities";
import { getFetchFunction, getFetchParameters } from "@fiftyone/utilities";
import * as _ from "lodash";
import { useEffect, useMemo } from "react";
import * as recoil from "recoil";
import "./externalize";
import { usingRegistry } from "./registry";
import { pluginsLoaderAtom } from "./state";

async function fetchPluginsMetadata(): Promise<PluginDefinition[]> {
  const result = await getFetchFunction()("GET", "/plugins");
  if (result && result.plugins) {
    return result.plugins.map((p) => new PluginDefinition(p));
  }
  throw new Error("Failed to fetch plugins metadata");
}

class PluginDefinition {
  name: string;
  version: string;
  license: string;
  description: string;
  fiftyone_compatibility: string;
  operators: string[];
  jsBundle: string | null;
  pyEntry: string | null;
  jsBundleExists: boolean;
  jsBundleServerPath: string | null;
  jsBundleHash: string | null;
  serverPath: string;
  hasPy: boolean;
  hasJS: boolean;
  builtin: boolean;

  constructor(json: any) {
    const serverPathPrefix = fou.getFetchPathPrefix();
    this.name = json.name;
    this.version = json.version;
    this.license = json.license;
    this.description = json.description;
    this.fiftyone_compatibility = json.fiftyone_compatibility;
    this.operators = json.operators;
    this.jsBundle = json.js_bundle;
    this.pyEntry = json.py_entry;

    this.jsBundleExists = json.js_bundle_exists;
    this.jsBundleServerPath = `${serverPathPrefix}${json.js_bundle_server_path}`;
    this.jsBundleHash = json.js_bundle_hash;
    this.hasPy = json.has_py;
    this.hasJS = json.has_js;
    this.serverPath = `${serverPathPrefix}${json.server_path}`;
    this.builtin = json.builtin;
  }
}

export async function loadPlugins() {
  const plugins = await fetchPluginsMetadata();
  const { pathPrefix } = getFetchParameters();
  for (const plugin of plugins) {
    usingRegistry().registerPluginDefinition(plugin);
    if (plugin.hasJS) {
      const name = plugin.name;
      const scriptPath = plugin.jsBundleServerPath;
      const cacheKey = plugin.jsBundleHash ? `?h=${plugin.jsBundleHash}` : "";
      if (usingRegistry().hasScript(name)) {
        console.debug(`Plugin "${name}": already loaded`);
        continue;
      }
      try {
        await loadScript(name, pathPrefix + scriptPath + cacheKey);
      } catch (e) {
        console.error(`Plugin "${name}": failed to load!`);
        console.error(e);
      }
    }
  }
}
async function loadScript(name, url) {
  console.debug(`Plugin "${name}": loading script...`);
  return new Promise<void>((resolve, reject) => {
    const onDone = (e) => {
      script.removeEventListener("load", onDone);
      script.removeEventListener("error", onDone);
      console.debug(`Plugin "${name}": loaded!`);
      if (e?.type === "load") {
        resolve();
      } else {
        reject(new Error(`Plugin "${name}": Failed to load script ${url}`));
      }
      usingRegistry().registerScript(name);
    };
    const script = document.createElement("script");
    script.type = "application/javascript";
    if (import.meta.env?.VITE_API && !url.startsWith("http")) {
      script.src = `${import.meta.env?.VITE_API}${url}`;
    } else {
      script.src = url;
    }
    script.async = true;
    document.head.prepend(script);
    script.addEventListener("load", onDone);
    script.addEventListener("error", onDone);
  });
}

/**
 * A react hook for loading the plugin system.
 */
export function usePlugins() {
  const datasetName = recoil.useRecoilValue(fos.datasetName);
  const [state, setState] = recoil.useRecoilState(pluginsLoaderAtom);
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

/**
 * Get a plugin definition by name.
 * @param name The name of the plugin
 * @returns The plugin definition
 */
export function usePluginDefinition(name: string): PluginDefinition {
  return getPluginDefinition(name);
}

/**
 * Get a plugin definition by name.
 * @param name The name of the plugin
 * @returns The plugin definition
 */
export function getPluginDefinition(name: string): PluginDefinition {
  const pluginDefinition = usingRegistry().getPluginDefinition(name) as
    | PluginDefinition
    | undefined;
  if (!pluginDefinition) {
    throw new Error(`Plugin "${name}" not found`);
  }
  return pluginDefinition;
}

/**
 * Get the absolute path to a file within a plugin directory.
 * @param name The name of the plugin
 * @param path The path to the file within the plugin directory
 * @returns An absolute path to the file
 */
export function getAbsolutePluginPath(name: string, path: string): string {
  const pluginDefinition = getPluginDefinition(name);
  if (pluginDefinition) {
    return `${pluginDefinition.serverPath}/${path}`;
  }
}

export function usePluginSettings<T>(
  pluginName: string,
  defaults?: Partial<T>
): T {
  const datasetAppConfig = recoil.useRecoilValue(fos.datasetAppConfig);
  const appConfig = recoil.useRecoilValue(fos.config);

  const settings = useMemo(() => {
    const datasetPlugins = _.get(datasetAppConfig, "plugins", {});
    const appConfigPlugins = _.get(appConfig, "plugins", {});

    return _.merge<T | {}, Partial<T>, Partial<T>>(
      { ...defaults },
      _.get(appConfigPlugins, pluginName, {}),
      _.get(datasetPlugins, pluginName, {})
    );
  }, [appConfig, pluginName, defaults, datasetAppConfig]);

  return settings as T;
}

export * from "./registry";
export * from "./state";

export {
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
} from "./sample-renderer";
export type {
  GridConfig,
  MatchMedia,
  SampleRendererMatchContext,
  SampleRendererMediaContext,
  SampleRendererOptions,
  SampleRendererProps,
  SampleRendererRenderContext,
  SampleRendererSampleLike,
} from "./sample-renderer";
