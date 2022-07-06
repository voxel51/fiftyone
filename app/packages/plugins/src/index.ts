import React, { FunctionComponent, useEffect, useState } from "react";
import { getFetchFunction } from "@fiftyone/utilities";
import * as aggregations from "./aggregations";
import Aggregation from "./Aggregation";
import { useRecoilValue } from "recoil";

declare global {
  interface Window {
    __fo_plugin_registry__: PluginComponentRegistry;
    React: any;
  }
}

// required for plugins to use the same instance of React
window.React = React;

function usingRegistry() {
  if (!window.__fo_plugin_registry__)
    window.__fo_plugin_registry__ = new PluginComponentRegistry();
  return window.__fo_plugin_registry__;
}

export function registerComponent(registration: PluginComponentRegistration) {
  if (!registration.activator) {
    registration.activator = () => true;
  }
  usingRegistry().register(registration);
}
export function unregisterComponent(name: string) {
  usingRegistry().unregister(name);
}
export function getByType(type: PluginComponentType) {
  return usingRegistry().getByType(type);
}
async function fetchPluginsMetadata() {
  const res = await fetch("http://localhost:5151/plugins");
  const result = await res.json();
  return result;
}
export async function loadPlugins() {
  const { plugins } = await fetchPluginsMetadata();
  for (const { scriptPath, name } of plugins) {
    await loadScript(name, scriptPath);
  }
}
async function loadScript(name, url) {
  return new Promise<void>((resolve, reject) => {
    const onDone = (e) => {
      console.log(e.type, "load event");
      script.removeEventListener("load", onDone);
      script.removeEventListener("error", onDone);
      if (e.type === "load") {
        resolve();
      } else {
        reject(new Error(`Plugin "${name}": Failed to script ${url}`));
      }
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

export function useActivePlugins(type: PluginComponentType, ctx: any) {
  return usePlugin(type).filter((p) => {
    if (typeof p.activator === "function") {
      return p.activator(ctx);
    }
    return false;
  });
}

export enum PluginComponentType {
  SampleModalContent,
  Plot,
}

type PluginActivator = (props: any) => boolean;
interface PluginComponentRegistration {
  name: string;
  label?: string;
  component: FunctionComponent;
  type: PluginComponentType;
  activator: PluginActivator;
}

const DEFAULT_ACTIVATOR = () => true;

function assert(ok, msg) {
  if (ok === false || ok === null || ok === undefined) throw new Error(msg);
}
const REQUIRED = ["name", "type", "component"];
class PluginComponentRegistry {
  private data = new Map<string, PluginComponentRegistration>();
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
    assert(
      !this.data.has(name),
      `${name} is already a registered Plugin Component`
    );
    this.data.set(name, registration);
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
}

export function useAction(action: any) {
  return action;
}

export const actions = {
  viewSample: (sampleId: string) => {},
};

const AGGREGATE_ROUTE = "/aggregate";

export function useAggregation() {
  const [isLoading, setLoading] = React.useState(true);
  const [result, setResult] = React.useState(null);
  // const dataset = useRecoilValue(atoms.dataset)

  const aggregate = async (
    aggregations: Aggregation[],
    datasetName?: string
  ) => {
    const jsonAggregations = aggregations.map((a) => a.toJSON());

    const resBody = (await getFetchFunction()("POST", AGGREGATE_ROUTE, {
      filters: null,
      dataset: datasetName,
      sample_ids: null,
      aggregations: jsonAggregations,
    })) as any;
    setResult(resBody.aggregate);
    setLoading(false);
  };

  return [aggregate, result, isLoading];
}

export { aggregations };
