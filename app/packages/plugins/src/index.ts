import * as fos from "@fiftyone/state";
import * as _ from "lodash";
import { useMemo } from "react";
import * as recoil from "recoil";
import { PluginDefinition } from "./loadPlugins";
import { usingRegistry } from "./registry";

export {
  DATASET_REQUIRED_PLUGIN_SCOPES,
  FALLBACK_PLUGIN_SCOPES,
  normalizePluginScopes,
  pluginRequiresDataset,
  PluginScope,
  scopeRequiresDataset,
} from "./PluginScope";

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
  defaults?: Partial<T>,
): T {
  const datasetAppConfig = recoil.useRecoilValue(fos.datasetAppConfig);
  const appConfig = recoil.useRecoilValue(fos.config);

  const settings = useMemo(() => {
    const datasetPlugins = _.get(datasetAppConfig, "plugins", {});
    const appConfigPlugins = _.get(appConfig, "plugins", {});

    return _.merge<T | {}, Partial<T>, Partial<T>>(
      { ...defaults },
      _.get(appConfigPlugins, pluginName, {}),
      _.get(datasetPlugins, pluginName, {}),
    );
  }, [appConfig, pluginName, defaults, datasetAppConfig]);

  return settings as T;
}

export { loadPlugins } from "./loadPlugins";
export * from "./registry";

export {
  createSampleRendererMediaContext,
  createSampleRendererRenderContext,
  getMatchingSampleRenderer,
  getSampleRendererComponent,
  getSampleRendererGridSlotComponent,
  isSampleRendererModalPersistent,
  SAMPLE_RENDERER_GRID_SLOT,
} from "./sample-renderer";
export type {
  GridConfig,
  MatchMedia,
  ModalConfig,
  SampleRendererGridClickBehavior,
  SampleRendererGridSlot,
  SampleRendererMatchContext,
  SampleRendererMediaContext,
  SampleRendererOptions,
  SampleRendererProps,
  SampleRendererRenderContext,
  SampleRendererSampleLike,
} from "./sample-renderer";

export * from "./context";
