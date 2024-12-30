import { useOperators } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import * as fou from "@fiftyone/utilities";
import { getFetchFunction, getFetchParameters } from "@fiftyone/utilities";
import * as _ from "lodash";
import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import * as recoil from "recoil";
import { wrapCustomComponent } from "./components";
import "./externalize";
import { pluginsLoaderAtom } from "./state";

declare global {
  interface Window {
    __fo_plugin_registry__: PluginComponentRegistry;
  }
}

function usingRegistry() {
  if (!window.__fo_plugin_registry__) {
    window.__fo_plugin_registry__ = new PluginComponentRegistry();
  }
  return window.__fo_plugin_registry__;
}

/**
 * Adds a plugin to the registry. This is called by the plugin itself.
 * @param registration The plugin registration
 */
export function registerComponent<T>(
  registration: PluginComponentRegistration<T>
) {
  if (!registration.activator) {
    registration.activator = () => true;
  }
  usingRegistry().register(registration);
}

/**
 * Remove a plugin from the registry.
 * @param name The name of the plugin
 */
export function unregisterComponent(name: string) {
  usingRegistry().unregister(name);
}

/**
 * Subscribe to plugin registry's "subscribe" and "unsubscribe" event.
 * @param handler The event handler called with the event type
 * @returns A function to unsubscribe
 */
export function subscribeToRegistry(handler: RegistryEventHandler) {
  return usingRegistry().subscribe(handler);
}

/**
 * Get a list of plugins match the given `type`.
 * @param type The type of plugin to list
 * @returns A list of plugins
 */
export function getByType(type: PluginComponentType) {
  return usingRegistry().getByType(type);
}

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
    script.src = url;
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

export function usePlugin(
  type: PluginComponentType
): PluginComponentRegistration[] {
  return usingRegistry().getByType(type);
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
  const pluginDefinition = usingRegistry().getPluginDefinition(name);
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

/** a utility for safely calling plugin defined activator functions */
export function safePluginActivator(
  plugin: PluginComponentRegistration,
  ctx: any
): boolean {
  if (typeof plugin.activator === "function") {
    try {
      return plugin.activator(ctx);
    } catch (e) {
      console.error(`Error activating plugin ${plugin.name}`, e);
    }
  }
  return false;
}

/**
 * A react hook that returns a list of active plugins.
 *
 * @param type The type of plugin to list
 * @param ctx Argument passed to the plugin's activator function
 * @returns A list of active plugins
 */
export function useActivePlugins(type: PluginComponentType, ctx: any) {
  const [plugins, setPlugins] = useState<PluginComponentRegistration[]>(
    usingRegistry()
      .getByType(type)
      .filter((p) => {
        return safePluginActivator(p, ctx);
      })
  );

  useEffect(() => {
    const unsubscribe = subscribeToRegistry(() => {
      const refreshedPlugins = usingRegistry()
        .getByType(type)
        .filter((p) => {
          return safePluginActivator(p, ctx);
        });

      setPlugins(refreshedPlugins);
    });

    return () => {
      unsubscribe();
    };
  }, [type, ctx]);

  return plugins;
}

/**
 * A react hook that returns a component plugin by name if exist.
 * @param name The name of the plugin
 * @param ctx Argument passed to the plugin's activator function
 * @returns The plugin component or `undefined`
 */
export function usePluginComponent(name: string, ctx?: unknown) {
  const plugins = useActivePlugins(PluginComponentType.Component, ctx);
  return plugins.find((p) => p.name === name);
}

/**
 * The type of plugin component.
 *
 * - `Panel` - A panel that can be added to `@fiftyone/spaces`
 * - `Plot` - **deprecated** - A plot that can be added as a panel
 */
export enum PluginComponentType {
  Plot = 1,
  Panel = 2,
  Component = 3,

  /**
   * DO NOT CHANGE THE VALUES OF THESE ENUMS for backward compatibility.
   * Changing these values WILL break existing plugins.
   */
}

type CategoryID = "import" | "curate" | "analyze" | "custom";

export enum Categories {
  Import = "import",
  Curate = "curate",
  Analyze = "analyze",
  Custom = "custom",
}

export function getCategoryLabel(category: CategoryID): string {
  switch (category) {
    case "import":
      return "Import";
    case "curate":
      return "Curate";
    case "analyze":
      return "Analyze";
    default:
      return "Custom";
  }
}

export function getCategoryForPanel(panel: PluginComponentRegistration) {
  return panel.panelOptions?.category || "custom";
}

type PluginActivator = (props: any) => boolean;

type PanelOptions = {
  /**
   * Whether to allow multiple instances of the plugin.
   *
   * Defaults to `false`.
   */
  allowDuplicates?: boolean;

  /**
   * Priority of the panel as it shows up in panel selector dropdown.
   * Panels are sorted by priority in ascending order.
   */
  priority?: number;

  /**
   * Markdown help text for the plugin.
   */
  helpMarkdown?: string;

  /** Surfaces where plugin is made available.
   * If this is not provided, the plugin will be available in grid only.
   */
  surfaces?: "grid" | "modal" | "grid modal";

  /**
   * Content displayed on the right side of the label in the panel title bar.
   */
  TabIndicator?: React.ComponentType;

  /**
   * The category of the plugin.
   *
   * Defaults to `custom`.
   */
  category?: CategoryID;

  /**
   * Whether the plugin is in beta.
   * This is used to highlight beta plugins.
   *
   * Defaults to `false`.
   */
  beta?: boolean;

  /**
   * Whether the plugin is new.
   * This is used to highlight new plugins.
   *
   * Defaults to `false`.
   */
  isNew: boolean;
};

type PluginComponentProps<T> = T & {
  panelNode?: unknown;
  dimensions?: unknown;
  isModalPanel?: boolean;
};

/**
 * A plugin registration.
 */
export interface PluginComponentRegistration<T extends {} = {}> {
  /**
   * The name of the plugin
   */
  name: string;

  /**
   * The optional label of the plugin to display to the user
   */
  label: string;

  /**
   * Primary icon for the plugin, also used in panel title bar
   */
  Icon?: React.ComponentType;

  /**
   * The React component to render for the plugin
   */
  component: FunctionComponent<PluginComponentProps<T>>;

  /** The plugin type */
  type: PluginComponentType;

  /**
   * A function that returns true if the plugin should be active
   */
  activator: PluginActivator;

  /**
   * Options for the panel
   */
  panelOptions?: PanelOptions;
}

const DEFAULT_ACTIVATOR = () => true;

function assert(ok, msg, printWarningOnly = false) {
  const failed = ok === false || ok === null || ok === undefined;
  if (failed && printWarningOnly) console.warn(msg);
  else if (failed) throw new Error(msg);
}
function warn(ok, msg) {
  assert(ok, msg, true);
}
const REQUIRED = ["name", "type", "component"];
class PluginComponentRegistry {
  private data = new Map<string, PluginComponentRegistration>();
  private pluginDefinitions = new Map<string, PluginDefinition>();
  private scripts = new Set<string>();
  private subscribers = new Set<RegistryEventHandler>();
  registerScript(name: string) {
    this.scripts.add(name);
  }
  registerPluginDefinition(pluginDefinition: PluginDefinition) {
    this.pluginDefinitions.set(pluginDefinition.name, pluginDefinition);
  }
  getPluginDefinition(name: string) {
    return this.pluginDefinitions.get(name);
  }
  hasScript(name: string) {
    return this.scripts.has(name);
  }
  register(registration: PluginComponentRegistration) {
    const { name } = registration;

    if (typeof registration.activator !== "function") {
      registration.activator = DEFAULT_ACTIVATOR;
    }

    for (let fieldName of REQUIRED) {
      assert(
        registration[fieldName],
        `${fieldName} is required to register a Plugin Component`
      );
    }
    warn(
      !this.data.has(name),
      `${name} is already a registered Plugin Component`
    );
    warn(
      registration.type !== PluginComponentType.Plot,
      `${name} is a Plot Plugin Component. This is deprecated. Please use "Panel" instead.`
    );

    const wrappedRegistration = {
      ...registration,
      component: wrapCustomComponent(registration.component),
    };

    this.data.set(name, wrappedRegistration);

    this.notifyAllSubscribers("register");
  }
  unregister(name: string): boolean {
    this.notifyAllSubscribers("unregister");
    return this.data.delete(name);
  }
  getByType(type: PluginComponentType) {
    const results = [];
    for (const registration of this.data.values()) {
      if (registration.type === type) {
        results.push(registration);
      }
    }

    return results;
  }
  clear() {
    this.data.clear();
  }
  subscribe(handler: RegistryEventHandler) {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }
  notifySubscriber(event: RegistryEvent, subscriber: RegistryEventHandler) {
    subscriber(event);
  }
  notifyAllSubscribers(event: RegistryEvent) {
    for (const handler of this.subscribers) {
      this.notifySubscriber(event, handler);
    }
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

export * from "./state";

type RegistryEvent = "register" | "unregister";
type RegistryEventHandler = (event: RegistryEvent) => void;
