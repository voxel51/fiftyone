const STORAGE_URL = /^(?:gs|s3|az):\/\//i;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

type SceneModelUrlResolver = (path: string) => Promise<string>;
const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:scene-model-url-resolver",
);
const registry = globalThis as Record<PropertyKey, unknown>;
const state = (registry[REGISTRY_KEY] ??= { resolver: null }) as {
  resolver: SceneModelUrlResolver | null;
};

/** Registers a resolver for storage-backed model URLs. */
export function registerSceneModelUrlResolver(
  resolver: SceneModelUrlResolver,
): () => void {
  if (state.resolver === resolver) return () => undefined;
  if (state.resolver) {
    throw new Error("A scene model URL resolver is already registered");
  }
  state.resolver = resolver;
  let active = true;
  return () => {
    if (!active || state.resolver !== resolver) return;
    active = false;
    state.resolver = null;
  };
}

/** Deduplicates URL resolution within a single model load. */
export function createSceneModelUrlResolver(modelUrl: string) {
  const resolver = state.resolver;
  const pending = new Map<string, Promise<string>>();

  return (uri: string): Promise<string> => {
    const path =
      STORAGE_URL.test(modelUrl) && !URL_SCHEME.test(uri)
        ? new URL(uri, modelUrl).href
        : uri;
    if (!STORAGE_URL.test(path)) return Promise.resolve(path);
    if (!resolver) {
      return Promise.reject(
        new Error("Storage-backed model assets require a URL resolver"),
      );
    }

    let result = pending.get(path);
    if (!result) {
      result = resolver(path).then((resolvedUrl) => {
        if (!/^https?:\/\//i.test(resolvedUrl)) {
          throw new Error("The model URL resolver must return an HTTP(S) URL");
        }
        return resolvedUrl;
      });
      pending.set(path, result);
    }
    return result;
  };
}
