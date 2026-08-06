import * as fou from "@fiftyone/utilities";
import { getFetchFunction, getFetchParameters } from "@fiftyone/utilities";
import "./externalize";
import { usingRegistry } from "./registry";

export class PluginDefinition {
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
  const result = await getFetchFunction()("GET", "/plugins");
  if (!result?.plugins) throw new Error("Failed to fetch plugins metadata");
  const plugins = result.plugins.map((plugin) => new PluginDefinition(plugin));
  const { pathPrefix } = getFetchParameters();
  await Promise.all(
    plugins.map((plugin) => {
      const registry = usingRegistry();
      registry.registerPluginDefinition(plugin);
      if (!plugin.hasJS) return undefined;
      const existing = registry.getScript(plugin.name);
      if (existing) {
        console.debug(`Plugin "${plugin.name}": already loaded`);
        return existing;
      }
      const cacheKey = plugin.jsBundleHash ? `?h=${plugin.jsBundleHash}` : "";
      const promise = loadScript(
        plugin.name,
        pathPrefix + plugin.jsBundleServerPath + cacheKey,
      ).catch((error) => {
        console.error(`Plugin "${plugin.name}": failed to load!`);
        console.error(error);
      });
      registry.registerScript(plugin.name, promise);
      return promise;
    }),
  );
}

function loadScript(name, url) {
  console.debug(`Plugin "${name}": loading script...`);
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const onDone = (event) => {
      script.removeEventListener("load", onDone);
      script.removeEventListener("error", onDone);
      if (event?.type === "load") {
        console.debug(`Plugin "${name}": loaded!`);
        resolve();
      } else {
        reject(new Error(`Plugin "${name}": Failed to load script ${url}`));
      }
    };
    script.type = "application/javascript";
    script.src =
      import.meta.env?.VITE_API && !url.startsWith("http")
        ? `${import.meta.env.VITE_API}${url}`
        : url;
    script.async = true;
    document.head.prepend(script);
    script.addEventListener("load", onDone);
    script.addEventListener("error", onDone);
  });
}
