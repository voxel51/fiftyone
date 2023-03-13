import * as fos from "@fiftyone/state";
import { Component, createElement } from "react";
import { getFetchFunction, getFetchOrigin } from "@fiftyone/utilities";
import * as _ from "lodash";
import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import * as recoil from "recoil";
import * as foc from "@fiftyone/components";
import * as fou from "@fiftyone/utilities";
import { PluginWrapper, wrapCustomComponent } from "./components";

declare global {
  interface Window {
    __fo_plugin_registry__: PluginComponentRegistry;
    React: any;
    ReactDOM: any;
    recoil: any;
    __fos__: any;
    __foc__: any;
    __fou__: any;
  }
}

if (typeof window !== "undefined") {
  // required for plugins to use the same instance of React
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.recoil = recoil;
  window.__fos__ = fos;
  window.__foc__ = foc;
  window.__fou__ = fou;
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
 * Get a list of plugins match the given `type`.
 * @param type The type of plugin to list
 * @returns A list of plugins
 */
export function getByType(type: PluginComponentType) {
  return usingRegistry().getByType(type);
}

type PluginDescription = {
  scriptPath: string;
  name: string;
};
type PluginSetting = {
  [settingName: string]: any;
  enabled?: boolean;
};
type PluginSettings = { [pluginName: string]: PluginSetting };
type PluginFetchResult = {
  plugins: PluginDescription[];
  settings?: PluginSettings;
};
async function fetchPluginsMetadata(): Promise<PluginFetchResult> {
  return getFetchFunction()("GET", "/plugins");
}

let _settings = null;
export async function loadPlugins() {
  const { plugins, settings } = await fetchPluginsMetadata();
  window.__fo_plugin_settings__ = settings;
  for (const { scriptPath, name } of plugins) {
    const pluginSetting = settings && settings[name];
    if (!pluginSetting || pluginSetting.enabled !== false) {
      if (usingRegistry().hasScript(name)) {
        console.log(`Plugin "${name}": already loaded`);
        continue;
      }
      try {
        await loadScript(name, `${getFetchOrigin()}${scriptPath}`);
      } catch (e) {
        console.error(`Plugin "${name}": failed to load!`);
        console.error(e);
      }
    }
  }
}
async function loadScript(name, url) {
  console.log(`Plugin "${name}": loading script...`);
  return new Promise<void>((resolve, reject) => {
    const onDone = (e) => {
      script.removeEventListener("load", onDone);
      script.removeEventListener("error", onDone);
      console.log(`Plugin "${name}": loaded!`);
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
  const [state, setState] = useState("loading");
  useEffect(() => {
    loadPlugins()
      .catch(() => {
        setState("error");
      })
      .then(() => {
        setState("ready");
      });
  }, []);

  return {
    isLoading: state === "loading",
    hasError: state === "error",
    ready: state === "ready",
  };
}

export function usePlugin(
  type: PluginComponentType
): PluginComponentRegistration[] {
  return usingRegistry().getByType(type);
}

/**
 * A react hook that returns a list of active plugins.
 *
 * @param type The type of plugin to list
 * @param ctx Argument passed to the plugin's activator function
 * @returns A list of active plugins
 */
export function useActivePlugins(type: PluginComponentType, ctx: any) {
  return useMemo(
    () =>
      usePlugin(type).filter((p) => {
        if (typeof p.activator === "function") {
          return p.activator(ctx);
        }
        return false;
      }),
    [ctx]
  );
}

/**
 * The type of plugin component.
 *
 * - `Panel` - A panel that can be added to `@fiftyone/spaces`
 * - `Plot` - **deprecated** - A plot that can be added as a panel
 * - `Visualizer` - Visualizes sample data
 */
export enum PluginComponentType {
  Visualizer,
  Plot,
  Panel,
}

type PluginActivator = (props: any) => boolean;

type PanelOptions = {
  allowDuplicates?: boolean;
  TabIndicator?: React.ComponentType;
};

type PluginComponentProps<T> = T & {
  panelNode?: unknown;
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
  Icon?: React.ComponentType;
  /**
   * The React component to render
   */
  component: FunctionComponent<PluginComponentProps<T>>;
  /** The plugin type */
  type: PluginComponentType;
  /**
   * A function that returns true if the plugin should be active
   */
  activator: PluginActivator;
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
  private scripts = new Set<string>();
  registerScript(name: string) {
    this.scripts.add(name);
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
      registration.type === PluginComponentType.Plot,
      `${name} is a Plot Plugin Component. This is deprecated. Please use "Panel" instead.`
    );

    const wrappedRegistration = {
      ...registration,
      component: wrapCustomComponent(registration.component),
    };

    this.data.set(name, wrappedRegistration);
  }
  unregister(name: string): boolean {
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
}

export function usePluginSettings<T>(
  pluginName: string,
  defaults?: Partial<T>
): T {
  const dataset = recoil.useRecoilValue(fos.dataset);
  const appConfig = recoil.useRecoilValue(fos.config);

  const settings = useMemo(() => {
    const datasetPlugins = _.get(dataset, "appConfig.plugins", {});
    const appConfigPlugins = _.get(appConfig, "plugins", {});

    return _.merge<T | {}, Partial<T>, Partial<T>>(
      { ...defaults },
      _.get(appConfigPlugins, pluginName, {}),
      _.get(datasetPlugins, pluginName, {})
    );
  }, [dataset, appConfig, pluginName, defaults]);

  return settings as T;
}
