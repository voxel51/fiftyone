import React, { FunctionComponent, useMemo, useSyncExternalStore } from "react";
import { wrapCustomComponent } from "./components";
import type {
  SampleRendererOptions,
  SampleRendererProps,
} from "./sample-renderer";
import { hasMatchMediaMatchers } from "./sample-renderer";

declare global {
  interface Window {
    __fo_plugin_registry__: PluginComponentRegistry;
  }
}

// Holds the registry when evaluated outside a browser (Next.js SSR), where
// `window` is undefined and the top-level registerComponent() calls would throw.
let serverRegistry: PluginComponentRegistry | undefined;

export function usingRegistry() {
  if (typeof window === "undefined") {
    if (!serverRegistry) {
      serverRegistry = new PluginComponentRegistry();
    }
    return serverRegistry;
  }
  if (!window.__fo_plugin_registry__) {
    window.__fo_plugin_registry__ = new PluginComponentRegistry();
  }
  return window.__fo_plugin_registry__;
}

/**
 * Adds a plugin to the registry. This is called by the plugin itself.
 * @param registration The plugin registration
 */
export function registerComponent<TType extends PluginComponentType>(
  registration: PluginComponentRegistrationByType[TType]
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
export function getByType<TType extends PluginComponentType>(type: TType) {
  return usingRegistry().getByType(type);
}

/** Returns the component registered under the given name. */
export function getComponent<T>(name: string) {
  return usingRegistry().getComponent<T>(name);
}

export function usePlugin<TType extends PluginComponentType>(
  type: TType
): PluginComponentRegistrationByType[TType][] {
  return usingRegistry().getByType(type);
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

// module scope so useSyncExternalStore doesn't re-subscribe on every render
const subscribeRegistry = (onChange: () => void) =>
  subscribeToRegistry(() => onChange());

const getRegistryVersion = () => usingRegistry().getVersion();

/** Active plugins of the given type, filtered by each plugin's `activator(ctx)`. */
export function useActivePlugins<TType extends PluginComponentType>(
  type: TType,
  ctx: Record<string, unknown>
) {
  // synchronous snapshot + atomic subscribe; a register between the two can't be dropped
  const version = useSyncExternalStore(subscribeRegistry, getRegistryVersion);

  return useMemo(
    () =>
      usingRegistry()
        .getByType(type)
        .filter((plugin) => safePluginActivator(plugin, ctx)),
    [type, ctx, version]
  );
}

/**
 * Returns a component plugin by name if it's available for the given `ctx`.
 * @param name The name of the plugin
 * @param ctx Argument passed to the plugin's activator function
 * @returns The plugin component or `undefined`
 */
export function usePluginComponent(name: string, ctx: Record<string, unknown>) {
  const plugins = useActivePlugins(PluginComponentType.Component, ctx);
  return plugins.find((p) => p.name === name);
}

/**
 * The type of plugin component.
 *
 * - `Panel` - A panel that can be added to `@fiftyone/spaces`
 * - `Plot` - **deprecated** - A plot that can be added as a panel
 * - `SampleRenderer` - A custom renderer for non-native sample media
 */
export enum PluginComponentType {
  Plot = 1,
  Panel = 2,
  Component = 3,
  SampleRenderer = 4,

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

export type PluginActivator = (props: any) => boolean;

export type PanelOptions = {
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
  surfaces?:
    | "grid"
    | "modal"
    | "portal"
    | "grid modal"
    | "grid portal"
    | "modal portal"
    | "grid modal portal";

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
   * Whether the plugin is in alpha.
   * This is used to highlight alpha plugins.
   *
   * Defaults to `false`.
   */
  alpha?: boolean;

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
  isNew?: boolean;
};

type PluginComponentProps<T> = T & {
  panelNode?: unknown;
  dimensions?: unknown;
  isModalPanel?: boolean;
};

type BasePluginComponentRegistration<
  TType extends PluginComponentType,
  TComponentProps
> = {
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
  component: FunctionComponent<TComponentProps>;

  /** The plugin type */
  type: TType;

  /**
   * A function that returns true if the plugin should be active
   */
  activator?: PluginActivator;
};

export type PanelRegistration<T extends {} = {}> =
  BasePluginComponentRegistration<
    PluginComponentType.Panel,
    PluginComponentProps<T>
  > & {
    panelOptions?: PanelOptions;
    sampleRendererOptions?: never;
  };

export type ComponentRegistration<T extends {} = {}> =
  BasePluginComponentRegistration<
    PluginComponentType.Component,
    PluginComponentProps<T>
  > & {
    panelOptions?: never;
    sampleRendererOptions?: never;
  };

export type PlotRegistration<T extends {} = {}> =
  BasePluginComponentRegistration<
    PluginComponentType.Plot,
    PluginComponentProps<T>
  > & {
    panelOptions?: never;
    sampleRendererOptions?: never;
  };

type BaseSampleRendererRegistration<TSample = unknown> =
  BasePluginComponentRegistration<
    PluginComponentType.SampleRenderer,
    SampleRendererProps
  > & {
    panelOptions?: never;
    sampleRendererOptions: SampleRendererOptions<TSample>;
  };

export type SampleRendererRegistration<TSample = unknown> =
  BaseSampleRendererRegistration<TSample>;

export interface PluginComponentRegistrationByType {
  [PluginComponentType.Plot]: PlotRegistration;
  [PluginComponentType.Panel]: PanelRegistration;
  [PluginComponentType.Component]: ComponentRegistration;
  [PluginComponentType.SampleRenderer]: SampleRendererRegistration;
}

export type PluginComponentRegistration =
  PluginComponentRegistrationByType[keyof PluginComponentRegistrationByType];

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

export function getCategoryForPanel(
  panel: PanelRegistration | PlotRegistration
) {
  return panel.panelOptions?.category || "custom";
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

export class PluginComponentRegistry {
  private data = new Map<string, PluginComponentRegistration>();
  private pluginDefinitions = new Map<string, PluginDefinitionLike>();
  private scripts = new Set<string>();
  private subscribers = new Set<RegistryEventHandler>();
  private version = 0;
  getVersion() {
    return this.version;
  }
  registerScript(name: string) {
    this.scripts.add(name);
  }
  registerPluginDefinition(pluginDefinition: PluginDefinitionLike) {
    this.pluginDefinitions.set(pluginDefinition.name, pluginDefinition);
  }
  getPluginDefinition(name: string) {
    return this.pluginDefinitions.get(name);
  }
  hasScript(name: string) {
    return this.scripts.has(name);
  }
  getComponent<T>(name: string) {
    const registration = this.data.get(name);
    if (!registration) {
      throw new Error(`No plugin component registered with name "${name}"`);
    }
    return registration.component as React.FunctionComponent<T>;
  }
  register(registration: PluginComponentRegistration) {
    const { name } = registration;

    if (typeof registration.activator !== "function") {
      registration.activator = DEFAULT_ACTIVATOR;
    }

    for (const fieldName of REQUIRED) {
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

    if (registration.type === PluginComponentType.SampleRenderer) {
      assert(
        registration.sampleRendererOptions,
        `${name} declared SampleRenderer without sampleRendererOptions`
      );

      const { supports } = registration.sampleRendererOptions;

      assert(
        Boolean(supports),
        `${name} declared SampleRenderer without sampleRendererOptions.supports`
      );

      if (supports && typeof supports !== "function") {
        warn(
          hasMatchMediaMatchers(supports),
          `${name} declared sampleRendererOptions.supports without any matchers`
        );
      }
    }

    // Sample renderers provide their own grid/modal-specific fallbacks and
    // should not inherit the generic plugin boundary, which clears the modal
    // on error before local recovery can run.
    const wrappedRegistration: PluginComponentRegistration = {
      ...registration,
      component:
        registration.type === PluginComponentType.SampleRenderer
          ? registration.component
          : wrapCustomComponent(registration.component),
    };

    this.data.set(name, wrappedRegistration);
    this.version++;

    this.notifyAllSubscribers("register");
  }
  unregister(name: string): boolean {
    const deleted = this.data.delete(name);
    if (deleted) {
      this.version++;
      this.notifyAllSubscribers("unregister");
    }
    return deleted;
  }
  getByType<TType extends PluginComponentType>(type: TType) {
    const results: PluginComponentRegistrationByType[TType][] = [];
    for (const registration of this.data.values()) {
      if (registration.type === type) {
        results.push(registration as PluginComponentRegistrationByType[TType]);
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

interface PluginDefinitionLike {
  name: string;
  [key: string]: unknown;
}

type RegistryEvent = "register" | "unregister";
type RegistryEventHandler = (event: RegistryEvent) => void;
