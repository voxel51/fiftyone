const CLOUD_URL = /^(?:gs|s3|az):\/\//i;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

type SceneModelCloudResolver = (path: string) => Promise<string>;
const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:scene-model-cloud-resolver",
);
const registry = globalThis as Record<PropertyKey, unknown>;
const state = (registry[REGISTRY_KEY] ??= { resolver: null }) as {
  resolver: SceneModelCloudResolver | null;
};

/** Supplies edition-specific cloud access without coupling rendering to it. */
export function registerSceneModelCloudResolver(
  resolver: SceneModelCloudResolver,
): () => void {
  if (state.resolver === resolver) return () => undefined;
  if (state.resolver)
    throw new Error("A scene model cloud resolver is already registered");
  state.resolver = resolver;
  let active = true;
  return () => {
    if (!active || state.resolver !== resolver) return;
    active = false;
    state.resolver = null;
  };
}

/** One resolver per load: share requests without caching expiring signed URLs. */
export function createSceneModelUrlResolver(modelUrl: string) {
  const cloudResolver = state.resolver;
  const pending = new Map<string, Promise<string>>();

  return (uri: string): Promise<string> => {
    const path =
      CLOUD_URL.test(modelUrl) && !URL_SCHEME.test(uri)
        ? new URL(uri, modelUrl).href
        : uri;
    if (!CLOUD_URL.test(path)) return Promise.resolve(path);
    if (!cloudResolver) {
      return Promise.reject(
        new Error("Cloud model assets require a cloud-storage URL resolver"),
      );
    }

    let result = pending.get(path);
    if (!result) {
      result = cloudResolver(path).then((signedUrl) => {
        if (!/^https?:\/\//i.test(signedUrl)) {
          throw new Error("The server did not return a valid signed model URL");
        }
        return signedUrl;
      });
      pending.set(path, result);
    }
    return result;
  };
}
