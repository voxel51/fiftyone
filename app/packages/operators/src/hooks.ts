import {
  pluginsLoaderAtom,
  useOperatorContextSelector,
} from "@fiftyone/plugins";
import { PluginScope } from "@fiftyone/plugins/src/PluginScope";
import debounce from "lodash/debounce";
import isEqual from "lodash/isEqual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { RESOLVE_PLACEMENTS_TTL } from "./constants";
import {
  ExecutionContext,
  fetchRemotePlacements,
  listLocalAndRemoteOperators,
  type RawContext,
  resolveLocalPlacements,
} from "./operators";
import {
  activePanelsEventCountAtom,
  activeScopeAtom,
  availableOperatorsRefreshCount,
  isInScope,
  operatorPlacementsAtom,
  operatorThrottledContext,
  operatorsInitializedAtom,
} from "./state";

async function resolvePlacements(context: RawContext) {
  const ctx = new ExecutionContext({}, context);
  const [remotePlacements, localPlacements] = await Promise.all([
    fetchRemotePlacements(ctx),
    resolveLocalPlacements(ctx),
  ]);

  return [...remotePlacements, ...localPlacements];
}

type ResolvedPlacements = Awaited<ReturnType<typeof resolvePlacements>>;

const MAX_PLACEMENT_RESOLUTIONS = 10;
const latestPlacementResolutions = new Map<
  string,
  { expiresAt: number; promise: Promise<ResolvedPlacements> }
>();

function resolvePlacementsOnce(context: RawContext) {
  const now = Date.now();
  const key = placementContextKey(context);
  const cached = latestPlacementResolutions.get(key);
  if (cached?.expiresAt > now) {
    return cached.promise;
  }

  const promise = resolvePlacements(context);
  latestPlacementResolutions.set(key, {
    expiresAt: now + RESOLVE_PLACEMENTS_TTL,
    promise,
  });
  if (latestPlacementResolutions.size > MAX_PLACEMENT_RESOLUTIONS) {
    latestPlacementResolutions.delete(
      latestPlacementResolutions.keys().next().value,
    );
  }
  promise.catch(() => {
    if (latestPlacementResolutions.get(key)?.promise === promise) {
      latestPlacementResolutions.delete(key);
    }
  });

  return promise;
}

function normalizeForCache(value: unknown): unknown {
  if (value instanceof Map) {
    return Array.from(value.entries())
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entry]) => [key, normalizeForCache(entry)]);
  }
  if (Array.isArray(value)) return value.map(normalizeForCache);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForCache(entry)]),
    );
  }
  return value;
}

function placementContextKey(context: RawContext) {
  const selectedLabels = [...(context.selectedLabels ?? [])]
    .map(normalizeForCache)
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const extendedSelection = context.extendedSelection && {
    ...context.extendedSelection,
    selection: context.extendedSelection.selection
      ? [...context.extendedSelection.selection].sort()
      : null,
  };
  return JSON.stringify(
    normalizeForCache({
      activeFields: context.activeFields,
      activeScope: context.activeScope,
      currentSample: context.currentSample,
      datasetName: context.datasetName,
      extended: context.extended,
      extendedSelection,
      filters: context.filters,
      groupSlice: context.groupSlice,
      queryPerformance: context.queryPerformance,
      selectedLabels,
      selectedSamples: context.selectedSamples,
      spaces: context.spaces,
      view: context.view,
      viewName: context.viewName,
      workspaceName: context.workspaceName,
    }),
  );
}

function useOperatorThrottledContextSetter() {
  const contextSelector = useOperatorContextSelector();
  const context = useRecoilValue(contextSelector) as RawContext;
  const setContext = useSetRecoilState(operatorThrottledContext);

  const setThrottledContext = useMemo(() => {
    return debounce(
      (context) => {
        setContext(context);
      },
      RESOLVE_PLACEMENTS_TTL,
      { leading: true },
    );
  }, [setContext]);

  useEffect(() => {
    setThrottledContext(context);
  }, [context, setThrottledContext]);

  useEffect(() => {
    return () => {
      setThrottledContext.cancel();
    };
  }, [setThrottledContext]);

  return context;
}

export function useOperatorPlacementsResolver() {
  const sourceContext = useOperatorThrottledContextSetter();
  const context = useRecoilValue(operatorThrottledContext);
  const activeScope = useRecoilValue(activeScopeAtom);
  const operatorsInitialized = useRecoilValue(operatorsInitializedAtom);
  const pluginsLoaderState = useRecoilValue(pluginsLoaderAtom);
  const setOperatorPlacementsAtom = useSetRecoilState(operatorPlacementsAtom);
  const [resolving, setResolving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const lastContext = useRef(null);
  const resolution = useRef(0);
  const placementContext = useMemo(
    () => ({ ...context, activeScope }) as RawContext,
    [context, activeScope],
  );

  useEffect(() => {
    async function updateOperatorPlacementsAtom() {
      const request = ++resolution.current;
      setResolving(true);
      try {
        const placements = await resolvePlacementsOnce(placementContext);
        if (request !== resolution.current) return;
        setOperatorPlacementsAtom(placements);
      } catch (error) {
        if (request !== resolution.current) return;
        console.error(error);
        lastContext.current = null;
      }
      if (request !== resolution.current) return;
      setResolving(false);
      setInitialized(true);
    }
    if (
      isEqual(sourceContext, context) &&
      !isEqual(lastContext.current, placementContext) &&
      operatorsInitialized &&
      pluginsLoaderState === "ready"
    ) {
      lastContext.current = placementContext;
      updateOperatorPlacementsAtom();
    }
  }, [
    context,
    sourceContext,
    placementContext,
    setOperatorPlacementsAtom,
    operatorsInitialized,
    pluginsLoaderState,
  ]);

  return { resolving, initialized };
}

export function useActivePanelEventsCount(id: string) {
  const [activePanelEventsCount, setActivePanelEventsCount] = useRecoilState(
    activePanelsEventCountAtom,
  );
  const count = useMemo(() => {
    return activePanelEventsCount.get(id) || 0;
  }, [activePanelEventsCount, id]);

  const increment = useCallback(
    (panelId?: string) => {
      const computedId = panelId ?? id;
      setActivePanelEventsCount((counts) => {
        const updatedCount = (counts.get(computedId) || 0) + 1;
        return new Map(counts).set(computedId, updatedCount);
      });
    },
    [id, setActivePanelEventsCount],
  );

  const decrement = useCallback(
    (panelId?: string) => {
      const computedId = panelId ?? id;
      setActivePanelEventsCount((counts) => {
        const updatedCount = (counts.get(computedId) || 0) - 1;
        if (updatedCount < 0) {
          return counts;
        }
        return new Map(counts).set(computedId, updatedCount);
      });
    },
    [id, setActivePanelEventsCount],
  );

  return { count, increment, decrement };
}

export function useFirstExistingUri(uris: string[]) {
  const availableOperators = useMemo(() => listLocalAndRemoteOperators(), []);
  return useMemo(() => {
    const existingUri = uris.find((uri) =>
      availableOperators.allOperators.some((op) => op.uri === uri),
    );
    const exists = Boolean(existingUri);
    return { firstExistingUri: existingUri, exists };
  }, [availableOperators, uris]);
}

export function useExecutableOperatorsURIs(scope?: PluginScope) {
  const refreshCount = useRecoilValue(availableOperatorsRefreshCount);
  const allOperators = useMemo(
    () => listLocalAndRemoteOperators(),
    [refreshCount],
  );
  const activeScope = useRecoilValue(activeScopeAtom);
  const computedScope = scope ?? activeScope;
  return useMemo(() => {
    const uris = allOperators.allOperators
      .filter(
        (op) =>
          op.config.canExecute && isInScope(op.config.scopes, computedScope),
      )
      .map((op) => op.uri);
    return uris;
  }, [allOperators, computedScope]);
}

export function useCanIExecuteOperators(uris: string[]) {
  const executableUris = useExecutableOperatorsURIs();
  const executableUriSet = useMemo(
    () => new Set(executableUris),
    [executableUris],
  );

  return useMemo(
    () => uris.every((uri) => executableUriSet.has(uri)),
    [executableUriSet, uris],
  );
}
