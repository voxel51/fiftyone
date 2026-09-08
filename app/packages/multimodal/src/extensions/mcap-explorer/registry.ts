/** Resolves a raw cloud-storage path into a browser-readable URL. */
export type McapCloudSourceResolver = (cloudPath: string) => Promise<string>;

interface McapCloudSourceResolverState {
  resolver: McapCloudSourceResolver | null;
}

const REGISTRY_KEY = Symbol.for(
  "@fiftyone/multimodal:mcap-cloud-source-resolver",
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const state = (globalRegistry[REGISTRY_KEY] ??= {
  resolver: null,
}) as McapCloudSourceResolverState;

/** Registers the edition-specific resolver for raw cloud-storage paths. */
export function registerMcapCloudSourceResolver(
  resolver: McapCloudSourceResolver,
): () => void {
  if (state.resolver === resolver) return () => undefined;
  if (state.resolver) {
    throw new Error("An MCAP cloud-source resolver is already registered");
  }

  state.resolver = resolver;
  let active = true;
  return () => {
    if (!active || state.resolver !== resolver) return;
    active = false;
    state.resolver = null;
  };
}

/** Returns the resolver contributed by the current product edition. */
export function getMcapCloudSourceResolver(): McapCloudSourceResolver | null {
  return state.resolver;
}

/** Whether the current product edition supports raw cloud-storage paths. */
export function hasMcapCloudSourceResolver(): boolean {
  return state.resolver !== null;
}
