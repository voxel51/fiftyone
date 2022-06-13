import {FunctionComponent, useEffect, useState} from 'react'
declare global {
  interface Window {
    __fo_plugin_registry__: PluginComponentRegistry;
  }
}

function usingRegistry() {
  if (!window.__fo_plugin_registry__) window.__fo_plugin_registry__ = new PluginComponentRegistry()
  return window.__fo_plugin_registry__
}

export function registerComponent(registration: PluginComponentRegistration) {
  usingRegistry().register(registration)
}
export function unregisterComponent(name: string) {
  usingRegistry().unregister(name)
}
export function getByType(type: PluginComponentType) {
  return usingRegistry().getByType(type)
}
async function fetchPluginsMetadata() {
  const res = await fetch('http://localhost:5151/plugins')
  const result = await res.json()
  return result
}
export async function loadPlugins() {
  const {plugins} = await fetchPluginsMetadata()
  for (const {scriptPath, name} of plugins) {
    await loadScript(name, scriptPath)
  }
}
async function loadScript(name, url) {
  return new Promise<void>((resolve, reject) => {
    const onDone = e => {
      console.log(e.type, 'load event')
      script.removeEventListener("load", onDone);
      script.removeEventListener("error", onDone);
      if (e.type === 'load') {
        resolve();
      } else {
        reject(new Error(`Plugin "${name}": Failed to script ${url}`));
      }
    }
    const script = document.createElement("script");
    script.type = "application/javascript";
    script.src = url;
    script.async = true;
    document.head.prepend(script);
    script.addEventListener("load", onDone);
    script.addEventListener("error", onDone);
  })
}

export function usePlugins() {
  const [state, setState] = useState('loading')
  useEffect(() => {
    loadPlugins()
      .catch(() => {
        setState('error')
      })
      .then(() => {
        setState('ready')
      })
  }, [])

  return {
    isLoading: state === 'loading',
    hasError: state === 'error',
    ready: state === 'ready'
  }
}

export function usePlugin(type: PluginComponentType) {
  return usingRegistry().getByType(type)
}

export enum PluginComponentType {
  SampleModalContent,
}

interface PluginComponentRegistration {
  name: string,
  component: FunctionComponent,
  type: PluginComponentType
}

function assert(ok, msg) {
  if (ok === false || ok === null || ok === undefined) throw new Error(msg)
}
const REQUIRED = ['name', 'type', 'component']
class PluginComponentRegistry {
  private data = new Map<string, PluginComponentRegistration>()
  register(registration: PluginComponentRegistration) {
    const {name} = registration
    for (let fieldName of REQUIRED) {
      assert(
        registration[fieldName],
        `${fieldName} is required to register a Plugin Component`
      )
    }
    assert(
      !this.data.has(name),
      `${name} is already a registered Plugin Component`
    )
    this.data.set(name, registration)
  }
  unregister(name: string): boolean {
    return this.data.delete(name)
  }
  getByType(type: PluginComponentType) {
    const results = []
    for (const registration of this.data.values()) {
      if (registration.type === type) {
        results.push(registration)
      }
    }
    return results
  }
}