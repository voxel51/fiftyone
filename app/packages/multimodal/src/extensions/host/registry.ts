interface OrderedExtension {
  readonly id: string;
  readonly order: number;
}

interface ExtensionRegistryState<Extension extends OrderedExtension> {
  readonly extensions: Map<string, Extension>;
  listeners?: Set<() => void>;
  snapshot: readonly Extension[];
}

/** Shared global lifecycle for product extension registries. */
export interface ExtensionRegistry<Extension extends OrderedExtension> {
  get(id: string): Extension | undefined;
  getSnapshot(): readonly Extension[];
  register(extension: Extension): () => void;
  resetForTests(): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Creates a deterministic registry backed by a stable global symbol slot.
 *
 * The slot is supplied by each public extension domain because its exact name
 * is part of the cross-package module-reload contract.
 */
export function createExtensionRegistry<Extension extends OrderedExtension>(
  slot: symbol,
  duplicateKind: string,
): ExtensionRegistry<Extension> {
  const globalRegistry = globalThis as Record<PropertyKey, unknown>;
  const state = (globalRegistry[slot] ??=
    createRegistryState<Extension>()) as ExtensionRegistryState<Extension>;
  // Older tile-registry instances did not carry listeners. Normalize a slot
  // retained across hot reload without discarding its registered extensions.
  const listeners = (state.listeners ??= new Set());

  const rebuildSnapshot = (): void => {
    state.snapshot = [...state.extensions.values()].sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
    for (const listener of listeners) listener();
  };

  return {
    get: (id) => state.extensions.get(id),
    getSnapshot: () => state.snapshot,
    register(extension) {
      const existing = state.extensions.get(extension.id);
      if (existing === extension) return () => undefined;
      if (existing) {
        throw new Error(`Duplicate ${duplicateKind} id: ${extension.id}`);
      }

      state.extensions.set(extension.id, extension);
      rebuildSnapshot();
      let active = true;
      return () => {
        if (!active || state.extensions.get(extension.id) !== extension) return;
        active = false;
        state.extensions.delete(extension.id);
        rebuildSnapshot();
      };
    },
    resetForTests() {
      if (state.extensions.size === 0) return;
      state.extensions.clear();
      rebuildSnapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createRegistryState<
  Extension extends OrderedExtension,
>(): ExtensionRegistryState<Extension> {
  return {
    extensions: new Map(),
    listeners: new Set(),
    snapshot: [],
  };
}
