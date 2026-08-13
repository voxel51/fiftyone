import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { SceneSource } from "../../../ir";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  readSidebarPreferences,
  subscribeSidebarPreferences,
  updateSidebarPreferences,
  type SidebarPreferences,
} from "./sidebar-preferences";
import {
  createSemanticSourceIndex,
  groupSourcesBySemanticIdentity,
  resolveSemanticSourceKeys,
  semanticSourceKeysForRuntimeIds,
  type SemanticSourceIndex,
  type SemanticSourceKey,
} from "./semantic-source";

export interface SidebarPreferencesContextValue {
  readonly index: SemanticSourceIndex;
  readonly preferences: SidebarPreferences;
  readonly scopeKey: string | null;
  readonly sources: readonly SceneSource[];
  readonly updatePreferences: (
    resolver: (current: SidebarPreferences) => SidebarPreferences,
  ) => void;
}

const SidebarPreferencesContext =
  createContext<SidebarPreferencesContextValue | null>(null);
const EMPTY_SOURCES: readonly SceneSource[] = Object.freeze([]);
const EMPTY_STREAMS: readonly string[] = Object.freeze([]);
const EMPTY_SOURCE_INDEX: SemanticSourceIndex = createSemanticSourceIndex([]);
const NOOP_PREFERENCE_UPDATE = () => undefined;

/** Owns one mounted dataset/media-field preference scope and source mapping. */
export const SidebarPreferencesProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly scopeKey?: string;
  readonly sources?: readonly SceneSource[];
}> = ({ children, scopeKey, sources = EMPTY_SOURCES }) => {
  const normalizedScope = scopeKey?.trim() || null;
  const index = useMemo(() => createSemanticSourceIndex(sources), [sources]);
  const [preferences, setPreferences] = useState(() =>
    readSidebarPreferences(normalizedScope),
  );
  // This layout effect swaps storage subscriptions before descendants paint
  // with state from a previously mounted dataset scope.
  useLayoutEffect(() => {
    const next = readSidebarPreferences(normalizedScope);
    setPreferences(next);
    return subscribeSidebarPreferences(normalizedScope, setPreferences);
  }, [normalizedScope]);
  const updatePreferences = useCallback(
    (resolver: (current: SidebarPreferences) => SidebarPreferences) => {
      if (!normalizedScope) return;
      const next = updateSidebarPreferences(normalizedScope, resolver);
      setPreferences(next);
    },
    [normalizedScope],
  );
  const value = useMemo(
    () => ({
      index,
      preferences,
      scopeKey: normalizedScope,
      sources,
      updatePreferences,
    }),
    [index, normalizedScope, preferences, sources, updatePreferences],
  );
  return (
    <SidebarPreferencesContext.Provider value={value}>
      {children}
    </SidebarPreferencesContext.Provider>
  );
};

/** Returns the mounted dataset/media-field preference scope. */
export function usePanelVisibilityScope(): string | null {
  return useContext(SidebarPreferencesContext)?.scopeKey ?? null;
}

/** Internal context access for domain hooks that resolve current runtime IDs. */
export function useSidebarPreferencesContext(): SidebarPreferencesContextValue | null {
  return useContext(SidebarPreferencesContext);
}

/** Semantic source mapping owned by the mounted playback host. */
export function useSidebarSourceIdentity(): {
  readonly groupedSources: (
    sources: readonly SceneSource[],
  ) => readonly SceneSource[];
  readonly keyForRuntimeId: (runtimeId: string) => SemanticSourceKey | null;
  readonly runtimeIdsForKey: (key: SemanticSourceKey) => readonly string[];
  readonly runtimeIdsForKeys: (
    keys: readonly SemanticSourceKey[],
  ) => readonly string[];
  readonly semanticKeysForRuntimeIds: (
    ids: readonly string[],
  ) => readonly SemanticSourceKey[];
} {
  const context = useContext(SidebarPreferencesContext);
  const index = context?.index ?? EMPTY_SOURCE_INDEX;
  return useMemo(
    () => ({
      groupedSources: groupSourcesBySemanticIdentity,
      keyForRuntimeId: (runtimeId: string) =>
        index.keyByRuntimeId.get(runtimeId) ?? null,
      runtimeIdsForKey: (key: SemanticSourceKey) =>
        index.runtimeIdsByKey.get(key) ?? EMPTY_STREAMS,
      runtimeIdsForKeys: (keys: readonly SemanticSourceKey[]) =>
        resolveSemanticSourceKeys(keys, index),
      semanticKeysForRuntimeIds: (ids: readonly string[]) =>
        semanticSourceKeysForRuntimeIds(ids, index),
    }),
    [index],
  );
}

/** Reactive scope-local state for appearance and camera consumers. */
export function useSidebarPreferencesState(): readonly [
  SidebarPreferences,
  (resolver: (current: SidebarPreferences) => SidebarPreferences) => void,
] {
  const context = useContext(SidebarPreferencesContext);
  return context
    ? [context.preferences, context.updatePreferences]
    : [DEFAULT_SIDEBAR_PREFERENCES, NOOP_PREFERENCE_UPDATE];
}
