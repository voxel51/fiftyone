import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Modal-scoped registry where mounted tiles publish a value keyed by tile
 * id and modal chrome (the settings sidebar, status strips) reads it back.
 *
 * This is the one sanctioned mechanism for tile → sidebar information flow:
 * a tile registers for its mounted lifetime, the registry preserves
 * registration order, and readers either enumerate every entry or address
 * the primary (preferred, else first-registered) tile. All hooks degrade
 * gracefully outside the provider so chrome can render in isolation.
 */
export interface EpisodeTileRegistry<T> {
  readonly Provider: React.FC<{ readonly children: React.ReactNode }>;
  /** Every registered entry in registration order; empty without a provider. */
  readonly useEntries: () => ReadonlyMap<string, T>;
  /** The preferred tile's entry, else the first registered, else null. */
  readonly usePrimary: (preferredTileId?: string | null) => T | null;
  /** Publishes `value` under `tileId` while the calling tile stays mounted. */
  readonly useRegister: (tileId: string | null | undefined, value: T) => void;
}

interface EpisodeTileRegistryValue<T> {
  readonly entries: ReadonlyMap<string, T>;
  readonly register: (tileId: string, value: T) => void;
  readonly unregister: (tileId: string) => void;
}

const EMPTY_ENTRIES: ReadonlyMap<string, never> = new Map<string, never>();

/**
 * Creates an independent tile registry. `name` labels the provider in React
 * devtools and error contexts; each call returns an isolated context.
 */
export function createEpisodeTileRegistry<T>(
  name: string,
): EpisodeTileRegistry<T> {
  const Context = createContext<EpisodeTileRegistryValue<T> | null>(null);

  const Provider: React.FC<{ readonly children: React.ReactNode }> = ({
    children,
  }) => {
    const [entries, setEntries] = useState<ReadonlyMap<string, T>>(
      () => new Map(),
    );
    // Registering an already-present tile updates its value in place —
    // Map.set preserves insertion order, so a value update never demotes
    // the tile's primary (first-registered) position.
    const register = useCallback((tileId: string, value: T) => {
      setEntries((current) => {
        if (current.has(tileId) && current.get(tileId) === value) {
          return current;
        }
        const next = new Map(current);
        next.set(tileId, value);
        return next;
      });
    }, []);
    const unregister = useCallback((tileId: string) => {
      setEntries((current) => {
        if (!current.has(tileId)) return current;
        const next = new Map(current);
        next.delete(tileId);
        return next;
      });
    }, []);
    const value = useMemo(
      () => ({ entries, register, unregister }),
      [entries, register, unregister],
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  };
  Provider.displayName = `${name}Provider`;

  function useRegister(tileId: string | null | undefined, value: T): void {
    const registry = useContext(Context);
    const register = registry?.register;
    const unregister = registry?.unregister;
    // This effect publishes value updates in place while the tile stays
    // mounted; the entry itself is removed only by the effect below.
    useEffect(() => {
      if (!tileId || !register) return;
      register(tileId, value);
    }, [register, tileId, value]);
    // This effect removes the registration on unmount or tile-id change.
    useEffect(() => {
      if (!tileId || !unregister) return undefined;
      return () => unregister(tileId);
    }, [tileId, unregister]);
  }

  function useEntries(): ReadonlyMap<string, T> {
    return useContext(Context)?.entries ?? EMPTY_ENTRIES;
  }

  function usePrimary(preferredTileId?: string | null): T | null {
    const entries = useEntries();
    return useMemo(() => {
      const preferred = preferredTileId
        ? entries.get(preferredTileId)
        : undefined;
      if (preferred !== undefined) return preferred;
      const first = entries.values().next();
      return first.done ? null : first.value;
    }, [entries, preferredTileId]);
  }

  return { Provider, useEntries, usePrimary, useRegister };
}
